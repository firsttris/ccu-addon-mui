import { useState } from 'react';
import { useWebSocketContext } from '../hooks/useWebsocket';
import { TranslationKey, useTranslations } from '../i18n/utils';
import { m } from '../paraglide/messages';

const errorMessages: Record<string, TranslationKey> = {
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOO_MANY_ATTEMPTS: 'TOO_MANY_ATTEMPTS',
  CCU_UNREACHABLE: 'CCU_UNREACHABLE',
};

export const Login = () => {
  const t = useTranslations();
  const { login, loginError, connectionStatus } = useWebSocketContext();
  const [username, setUsername] = useState('Admin');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const connected = connectionStatus === 'Open';

  // A new error (or a successful login, which unmounts this view) ends submitting
  const [lastError, setLastError] = useState(loginError);
  if (loginError !== lastError) {
    setLastError(loginError);
    setSubmitting(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 box-border">
      <form
        className="w-full max-w-[340px] flex flex-col gap-[14px] p-6 rounded-xl border border-solid border-border bg-card text-foreground"
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitting(true);
          login(username, password);
        }}
      >
        <h1 className="m-0 text-[22px] text-center">CCU Addon MUI</h1>
        <p className="m-0 text-[14px] text-muted-foreground text-center">{m.LOGIN_HINT()}</p>
        <label className="flex flex-col gap-1 text-[14px]">
          {m.USERNAME()}
          <input
            className="text-[17px] py-[10px] px-3 rounded-lg border border-solid border-border bg-background text-foreground"
            name="username"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-[14px]">
          {m.PASSWORD()}
          <input
            className="text-[17px] py-[10px] px-3 rounded-lg border border-solid border-border bg-background text-foreground"
            name="password"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {loginError && (
          <p role="alert" className="m-0 text-[#c62828] text-[14px] text-center">{t(errorMessages[loginError] ?? 'INVALID_CREDENTIALS')}</p>
        )}
        {!connected && <p className="m-0 text-[14px] text-muted-foreground text-center">{m.CONNECTING()}</p>}
        <button
          className="text-[17px] font-semibold p-3 border-none rounded-lg text-white bg-[#1976d2] cursor-pointer disabled:opacity-50 disabled:cursor-default"
          type="submit"
          disabled={!connected || submitting || username === ''}
        >
          {m.SIGN_IN()}
        </button>
      </form>
    </div>
  );
};
