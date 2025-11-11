export interface CCUEvent {
  event: {
    interface: string;
    channel: string;
    datapoint: string;
    value: unknown;
    timestamp: string;
  };
}

export interface RPCClient {
  methodCall(
    method: string,
    params: unknown[],
    callback: (err: Error | null, result?: unknown) => void,
  ): void;
}

export interface ScriptMessage {
  type: 'script';
  script: string;
  requestId?: string;
}

export interface SetValueMessage {
  type: 'setValue';
  address: string;
  datapoint: string;
  value: unknown;
  requestId?: string;
}

export interface SubscribeMessage {
  type: 'subscribe';
  deviceId: string;
  channels: string[];
  requestId?: string;
}

export type WebSocketMessage =
  | ScriptMessage
  | SetValueMessage
  | SubscribeMessage;

export interface Config {
  wsPort: number;
  rpcPort: number;
  hmipPort: number;
  rpcServerPort: number;
  ccuHost: string;
  ccuUser?: string;
  ccuPass?: string;
  debug: boolean;
  callbackHost: string;
  regaPort: number;
}
