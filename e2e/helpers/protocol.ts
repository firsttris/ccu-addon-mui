import { readFileSync } from 'node:fs';
import path from 'node:path';
import Ajv from 'ajv';

// The WebSocket mock stands in for the Go server. The Go tests check every
// message of the real server against ServerMessage in protocol/schema.json;
// this checks what the mock sends the app against the same definition, so
// the mock can't drift from the server unnoticed.

const schema = JSON.parse(readFileSync(path.join(process.cwd(), 'protocol/schema.json'), 'utf8'));
const ajv = new Ajv({ strict: false });
ajv.addSchema(schema);
const validate = ajv.getSchema(`${schema.$id}#/definitions/ServerMessage`)!;

// The messages that don't match the schema, each once
export const protocolViolations = (messages: unknown[]) => {
  const seen = new Set<string>();
  const violations: string[] = [];
  for (const message of messages) {
    const text = JSON.stringify(message);
    if (seen.has(text)) continue;
    seen.add(text);
    if (!validate(message)) violations.push(`mock → app: ${text.slice(0, 300)}`);
  }
  return violations;
};
