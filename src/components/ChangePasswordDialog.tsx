import { useState } from 'react';
import { useWebSocketActions } from '../hooks/useWebsocket';
import { useToast } from '../contexts/ToastContext';
import { ConfirmDialog } from './ConfirmDialog';
import { Input } from './ui/input';
import { passwordAllowed } from '../views/setup/Users';
import { m } from '../paraglide/messages';
import { errorText } from '../lib/errors';

// Changes the password of the logged-in user, confirmed with the current
// one, as users may edit their own account in the WebUI
// (system.fn::saveUserPwd). The user's other devices are logged out.
export const ChangePasswordDialog = ({ onDone }: { onDone: () => void }) => {
  const { request } = useWebSocketActions();
  const { showToast } = useToast();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const problem =
    password === ''
      ? m.PW_REQUIRED()
      : !passwordAllowed(password)
        ? m.USERS_PASSWORD_CHARS()
        : password !== repeat
          ? m.USERS_PASSWORD_MISMATCH()
          : null;

  const save = async () => {
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await request({ type: 'changePassword', currentPassword: current, newPassword: password }, { queue: false });
      showToast(m.PW_CHANGED(), 'info');
      onDone();
    } catch (e) {
      setError(errorText(e, m.CHANGE_FAILED, { INVALID_CREDENTIALS: m.PW_WRONG_CURRENT }));
    } finally {
      setBusy(false);
    }
  };

  const field = 'flex flex-col gap-1';
  const label = 'text-xs text-muted-foreground';
  return (
    <ConfirmDialog title={m.PW_CHANGE()} confirmLabel={m.SAVE()} busy={busy} onConfirm={save} onCancel={onDone}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy) save();
        }}
      >
        <label className={field}>
          <span className={label}>{m.PW_CURRENT()}</span>
          <Input
            type="password"
            aria-label={m.PW_CURRENT()}
            autoComplete="current-password"
            autoFocus
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </label>
        <label className={field}>
          <span className={label}>{m.PW_NEW()}</span>
          <Input
            type="password"
            aria-label={m.PW_NEW()}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label className={field}>
          <span className={label}>{m.USERS_PASSWORD_REPEAT()}</span>
          <Input
            type="password"
            aria-label={m.USERS_PASSWORD_REPEAT()}
            autoComplete="new-password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
          />
        </label>
        <span className="text-xs text-muted-foreground">{m.PW_HINT()}</span>
        <button type="submit" hidden />
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
      </form>
    </ConfirmDialog>
  );
};
