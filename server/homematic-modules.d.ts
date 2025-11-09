declare module 'homematic-rega' {
  interface RegaOptions {
    host: string;
    port?: number;
    language?: string;
    disableTranslation?: boolean;
    tls?: boolean;
    inSecure?: boolean;
    auth?: boolean;
    user?: string;
    pass?: string;
  }

  class Rega {
    constructor(options: RegaOptions);
    script(
      file: string,
      callback: (err: Error | null, result: unknown) => void,
    ): void;
    exec(
      script: string,
      callback: (err: Error | null, result: unknown) => void,
    ): void;
  }

  export = Rega;
}

declare module 'homematic-xmlrpc' {
  interface ServerOptions {
    host: string;
    port: number;
  }

  interface ClientOptions {
    host: string;
    port: number;
    basic_auth?: {
      user: string;
      pass: string;
    };
  }

  interface RpcServer {
    on(
      event: 'system.multicall',
      handler: (
        method: string,
        params: unknown[],
        callback: (err: null | Error, result?: string) => void,
      ) => void,
    ): void;
    on(
      event: 'event',
      handler: (
        err: Error,
        params: unknown[],
        callback: (err: null | Error, result?: string) => void,
      ) => void,
    ): void;
    on(
      event: 'newDevices',
      handler: (
        err: Error,
        params: unknown[],
        callback: (err: null | Error, result?: string) => void,
      ) => void,
    ): void;
    on(
      event: 'deleteDevices',
      handler: (
        err: Error,
        params: unknown[],
        callback: (err: null | Error, result?: string) => void,
      ) => void,
    ): void;
  }

  interface RpcClient {
    methodCall(
      method: string,
      params: unknown[],
      callback: (err: Error | null, result?: unknown) => void,
    ): void;
  }

  function createServer(options: ServerOptions): RpcServer;
  function createClient(options: ClientOptions): RpcClient;

  export = { createServer, createClient };
}
