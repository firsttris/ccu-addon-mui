import { useState } from 'react';
import { useWebSocketContext } from '../hooks/useWebsocket';
import { m } from '../paraglide/messages';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { loginErrorText } from '../lib/errors';


export const Login = () => {
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
    <div className="flex min-h-screen items-center justify-center p-4">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 hidden dark:block"
        style={{
          background:
            'radial-gradient(600px 400px at 80% 0%, rgba(251,146,60,0.10), transparent 70%), radial-gradient(600px 500px at 0% 100%, rgba(56,189,248,0.08), transparent 70%)',
        }}
      />
      <form
        className="tile-edge flex w-full max-w-sm flex-col gap-5 rounded-2xl border bg-card p-6 shadow-sm"
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitting(true);
          login(username, password);
        }}
      >
        <div className="flex flex-col gap-1.5 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">CCU Addon MUI</h1>
          <p className="text-sm text-muted-foreground">{m.LOGIN_HINT()}</p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="username">{m.USERNAME()}</Label>
          <Input
            id="username"
            className="h-11 text-base"
            name="username"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">{m.PASSWORD()}</Label>
          <Input
            id="password"
            className="h-11 text-base"
            name="password"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        {loginError && (
          <p role="alert" className="text-center text-sm text-destructive">
            {loginErrorText(loginError)}
          </p>
        )}
        {!connected && <p className="text-center text-sm text-muted-foreground">{m.CONNECTING()}</p>}
        <Button type="submit" size="lg" disabled={!connected || submitting || username === ''}>
          {m.SIGN_IN()}
        </Button>
      </form>
    </div>
  );
};
