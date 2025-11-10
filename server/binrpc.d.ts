declare module 'binrpc' {
  export interface Server {
    on(
      event: string,
      handler: (
        err: null,
        params: unknown[],
        callback: (err: Error | null, result?: unknown) => void,
      ) => void,
    ): void;
  }

  export interface Client {
    methodCall(
      method: string,
      params: unknown[],
      callback: (err: Error | null, result?: unknown) => void,
    ): void;
  }

  export function createServer(options: { host: string; port: number }): Server;

  export function createClient(options: { host: string; port: number }): Client;
}
