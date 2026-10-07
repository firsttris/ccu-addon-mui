import { readFileSync } from 'node:fs';
import path from 'node:path';
import Ajv, { ValidateFunction } from 'ajv';

// The WebSocket mock stands in for the Go server. The Go tests check every
// message of the real server against protocol/schema.json; this checks the
// mock against the same schema, in both directions, so the mock can't drift
// from the server unnoticed: what it answers must be what the server may
// answer, and what the app sends must be a request the server knows.

type Schema = {
  $id: string;
  properties: Record<string, { $ref: string }>;
  definitions: Record<string, { properties?: Record<string, { const?: string; $ref?: string }> }>;
};

const schema: Schema = JSON.parse(
  readFileSync(path.join(process.cwd(), 'protocol/schema.json'), 'utf8'),
);
const ajv = new Ajv({ strict: false });
ajv.addSchema(schema);

const validators = new Map<string, ValidateFunction>();
const validator = (definition: string) => {
  let validate = validators.get(definition);
  if (!validate) {
    validate = ajv.getSchema(`${schema.$id}#/definitions/${definition}`);
    if (!validate) throw new Error(`protocol/schema.json has no definition ${definition}`);
    validators.set(definition, validate);
  }
  return validate;
};

const refName = (ref: string) => ref.replace('#/definitions/', '');

// The definition of a call's request or response, by the message type
const callPart = (type: string, part: 'request' | 'response') => {
  const call = schema.properties[type];
  if (!call) return undefined;
  const ref = schema.definitions[refName(call.$ref)]?.properties?.[part]?.$ref;
  return ref && refName(ref);
};

// Messages the server sends unasked, by their type (SysvarsMessage …)
const pushTypes = new Map<string, string>();
for (const [name, definition] of Object.entries(schema.definitions)) {
  const type = definition.properties?.type?.const;
  if (type && name.endsWith('Message')) pushTypes.set(type, name);
}

export type Direction = 'server' | 'client';
export type Recorded = { direction: Direction; message: Record<string, unknown> };

const definitionFor = ({ direction, message }: Recorded, requests: Map<string, string>): string | undefined => {
  const type = typeof message.type === 'string' ? message.type : undefined;
  if (direction === 'client') {
    if (type === 'auth') return 'AuthRequest';
    if (type === 'login') return 'LoginRequest';
    return type && callPart(type, 'request');
  }
  if (type === 'error') return 'ErrorResponse';
  if (type === 'auth_response') return 'AuthResponse';
  // An answer belongs to its request: some carry no "<type>_response" (the
  // channel lists have no type, paramsets answer as "paramset")
  const requestId = typeof message.requestId === 'string' ? message.requestId : undefined;
  const request = requestId && requests.get(requestId);
  if (request) return callPart(request, 'response');
  if (type === undefined) return 'event' in message ? 'EventMessage' : undefined;
  if (type.endsWith('_response')) return callPart(type.slice(0, -'_response'.length), 'response');
  return pushTypes.get(type);
};

// The app adds a deviceId to every request, next to the requestId
// (useWebsocket request()); the server ignores it where it doesn't need it
const withoutEnvelope = (message: Record<string, unknown>, definition: string) => {
  const declared = schema.definitions[definition]?.properties ?? {};
  if ('deviceId' in declared || !('deviceId' in message)) return message;
  const { deviceId: _deviceId, ...rest } = message;
  return rest;
};

// The messages that don't match the schema, described for the test output
export const protocolViolations = (recorded: Recorded[]) => {
  const violations: string[] = [];
  const seen = new Set<string>();
  // The request type by requestId; the app counts anew after a reload, so
  // the latest request with an ID wins
  const requests = new Map<string, string>();
  for (const entry of recorded) {
    if (entry.direction === 'client' && typeof entry.message.requestId === 'string' && typeof entry.message.type === 'string') {
      requests.set(entry.message.requestId, entry.message.type);
    }
    const text = JSON.stringify(entry.message);
    const key = `${entry.direction} ${text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const from = entry.direction === 'server' ? 'mock → app' : 'app → mock';
    const definition = definitionFor(entry, requests);
    if (!definition) {
      violations.push(`${from}: type not in protocol/schema.json: ${text.slice(0, 300)}`);
      continue;
    }
    const validate = validator(definition);
    const message = entry.direction === 'client' ? withoutEnvelope(entry.message, definition) : entry.message;
    if (!validate(message)) {
      const errors = (validate.errors ?? [])
        .map((e) => {
          const field = (e.params as { additionalProperty?: string; missingProperty?: string });
          const name = field.additionalProperty ?? field.missingProperty;
          return `${e.instancePath || '/'} ${e.message}${name ? ` (${name})` : ''}`;
        })
        .join('; ');
      violations.push(`${from} (${definition}): ${errors}\n  ${text.slice(0, 300)}`);
    }
  }
  return violations;
};
