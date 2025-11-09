// Type definitions for homematic libraries (no official @types available)
declare module 'homematic-xmlrpc' {
  export function createServer(options: { host: string; port: number }): any;
  export function createClient(options: { host: string; port: number }): any;
}

declare module 'homematic-rega' {
  export class Rega {
    constructor(options: { host: string; port: number });
    script(
      script: string,
      callback: (err: Error | null, result: any) => void,
    ): void;
  }
}
