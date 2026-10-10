// A failed request; code is the server's error code, or NOT_CONNECTED and
// TIMEOUT from here.
export class RequestError extends Error {
  code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

// Asking again gets the same answer: the request was refused or is wrong.
// NOT_CONNECTED: the connection was lost; all queries are loaded again after
// the next login anyway.
const FINAL_ERRORS = new Set([
  'NOT_CONNECTED',
  'AUTH_REQUIRED',
  'FORBIDDEN',
  'ELEVATION_REQUIRED',
  'INVALID_REQUEST',
  'INVALID_VALUE',
  'NOT_SUPPORTED',
  'NOT_AVAILABLE',
  'NOT_FOUND',
]);

// Whether TanStack Query tries a failed query again: twice for a timeout
// or a CCU error, not for an answer that won't change
export const shouldRetry = (failureCount: number, error: unknown) =>
  failureCount < 2 && !(error instanceof RequestError && error.code !== undefined && FINAL_ERRORS.has(error.code));
