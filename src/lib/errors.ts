import { RequestError } from '../hooks/useWebsocket';
import { m } from '../paraglide/messages';

type Text = () => string;

// Texts for the error codes any request with a password may answer
// (docs/protokoll.md, Fehlercodes)
const passwordErrors: Record<string, Text> = {
  INVALID_CREDENTIALS: m.INVALID_CREDENTIALS,
  TOO_MANY_ATTEMPTS: m.TOO_MANY_ATTEMPTS,
  CCU_UNREACHABLE: m.CCU_UNREACHABLE,
  CCU_NOT_READY: m.CCU_NOT_READY,
  // A change the account's level does not allow (on openccu-lite: one that
  // needs the system's administrator)
  FORBIDDEN: m.NOT_PERMITTED,
};

export const errorCode = (error: unknown) => (error instanceof RequestError ? error.code : undefined);

// The text for a failed request: the caller's own text for its codes, else
// one of the common ones, else what failed with the server's message
export const errorText = (error: unknown, failed: Text, own: Record<string, Text> = {}) => {
  const code = errorCode(error);
  const text = code ? (own[code] ?? passwordErrors[code]) : undefined;
  if (text) return text();
  return `${failed()}${error instanceof Error && error.message ? `: ${error.message}` : ''}`;
};

// Logging in or entering the password again: a known code, else wrong
// credentials
export const loginErrorText = (code: string | null | undefined) =>
  (passwordErrors[code ?? ''] ?? m.INVALID_CREDENTIALS)();
