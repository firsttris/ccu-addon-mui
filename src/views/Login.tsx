import { useState } from 'react';
import { useWebSocketContext } from '../hooks/useWebsocket';
import { useEffects } from '../contexts/EffectsContext';
import { m } from '../paraglide/messages';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { loginErrorText } from '../lib/errors';
import { cn } from '../lib/utils';

export const Login = () => {
  const { login, loginError, connectionStatus } = useWebSocketContext();
  const { on: effects } = useEffects();
  const [username, setUsername] = useState('Admin');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Remounts the error, so it shakes again on every failed attempt
  const [attempt, setAttempt] = useState(0);

  const connected = connectionStatus === 'Open';

  // A new error (or a successful login, which unmounts this view) ends submitting
  const [lastError, setLastError] = useState(loginError);
  if (loginError !== lastError) {
    setLastError(loginError);
    setSubmitting(false);
    if (loginError) setAttempt(attempt + 1);
  }

  return (
    <div
      className={cn(
        'login relative flex min-h-screen flex-col items-center justify-center overflow-hidden p-4',
        effects && 'login-fx',
      )}
    >
      <div aria-hidden className="login-grid pointer-events-none absolute inset-0" />
      <div aria-hidden className="login-glow -top-40 -right-32 bg-orange-400/10" />
      <div aria-hidden className="login-glow -bottom-40 -left-32 bg-sky-400/10 [animation-delay:-7s]" />
      <form
        className="login-card tile-edge relative flex w-full max-w-sm flex-col gap-5 rounded-2xl border bg-card p-6 shadow-sm"
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitting(true);
          login(username, password);
        }}
      >
        <div className="flex flex-col gap-1.5 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">MUI · Homematic</h1>
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
          <p key={attempt} role="alert" className="login-shake text-center text-sm text-destructive">
            {loginErrorText(loginError)}
          </p>
        )}
        {!connected && <p className="text-center text-sm text-muted-foreground">{m.CONNECTING()}</p>}
        <Button
          type="submit"
          size="lg"
          className="group relative overflow-hidden"
          disabled={!connected || submitting || username === ''}
        >
          <span aria-hidden className="login-sheen pointer-events-none absolute inset-0" />
          {m.SIGN_IN()}
        </Button>
      </form>
      <House />
    </div>
  );
};

// Window panes: left, top and when its command goes out (s after the start)
const LAMPS = [
  { x: 80, y: 66, delay: 0.4 },
  { x: 142, y: 88, delay: 5.4 },
  { x: 80, y: 88, delay: 7.9 },
];
const BLIND = { x: 142, y: 66, delay: 2.9 };
const PANE = { width: 18, height: 14, rx: 2 };

/**
 * The logo brought to life: the CCU under the roof sends every 2.5 s, and each
 * command switches something in the house (light, blind, light, light), which
 * stays for about 5 s. Without animations every light is on and the blind up.
 */
const House = () => (
  <svg className="login-house mt-8 h-auto w-[300px] max-w-full" viewBox="0 0 240 124" aria-hidden>
    <defs>
      <pattern id="login-slats" width="4" height="3" patternUnits="userSpaceOnUse">
        <rect width="4" height="3" className="login-slat" />
        <rect y="2.2" width="4" height="0.8" className="login-slat-gap" />
      </pattern>
    </defs>
    <line x1="22" y1="112" x2="218" y2="112" className="login-ground" />
    <path d="M64 59 L120 14 L176 59 V106 a6 6 0 0 1 -6 6 H70 a6 6 0 0 1 -6 -6 Z" className="login-house-fill" />
    <path d="M64 60 V106 a6 6 0 0 0 6 6 H170 a6 6 0 0 0 6 -6 V60 M52 68 L120 14 L188 68" className="login-wall" />

    {/* The CCU in the gable, with its radio rings */}
    <circle cx="120" cy="44" r="10" className="login-ring" />
    <circle cx="120" cy="44" r="10" className="login-ring [animation-delay:0.15s]" strokeOpacity={0.6} />
    <rect x="112" y="39" width="16" height="10" rx="2.5" className="login-ccu" />
    <circle cx="124" cy="44" r="1.6" className="login-led fill-green-500" />

    {LAMPS.map(({ x, y, delay }) => (
      <g key={`${x}-${y}`}>
        <rect
          x={x - 4}
          y={y - 4}
          width={26}
          height={22}
          rx={4}
          className="login-lamp-glow"
          style={{ animationDelay: `${delay}s` }}
        />
        <rect x={x} y={y} {...PANE} className="login-pane" />
        <rect x={x} y={y} {...PANE} className="login-lamp" style={{ animationDelay: `${delay}s` }} />
      </g>
    ))}
    <rect x={BLIND.x} y={BLIND.y} {...PANE} className="login-pane" />
    <rect x={BLIND.x} y={BLIND.y} {...PANE} className="login-blind" style={{ animationDelay: `${BLIND.delay}s` }} />
    <path d={`M${BLIND.x} ${BLIND.y}h${PANE.width}`} className="login-blind-box" />

    <path d="M111 112 V92 a3 3 0 0 1 3 -3 h12 a3 3 0 0 1 3 3 V112" className="login-door" />
  </svg>
);
