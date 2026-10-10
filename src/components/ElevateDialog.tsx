import { useState } from 'react';
import { ConfirmDialog } from './ConfirmDialog';
import { Input } from './ui/input';
import { useWebSocketActions } from '../hooks/useWebsocket';
import { m } from '../paraglide/messages';
import { errorCode, loginErrorText } from '../lib/errors';

// Asks for the password again before settings may be changed
export const ElevateDialog = ({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) => {
  const { elevate } = useWebSocketActions();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await elevate(password);
      onDone();
    } catch (e) {
      setError(loginErrorText(errorCode(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConfirmDialog
      title={m.ELEVATE()}
      confirmLabel={m.CONFIRM()}
      busy={busy || password === ''}
      onConfirm={submit}
      onCancel={onCancel}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (password !== '') {
            submit();
          }
        }}
      >
        <label className="flex flex-col gap-3 text-muted-foreground">
          {m.ELEVATE_HINT()}
          <Input
            className="h-10"
            type="password"
            aria-label={m.PASSWORD()}
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="mt-2 text-destructive">
            {error}
          </p>
        )}
      </form>
    </ConfirmDialog>
  );
};
