import { useState } from 'react';
import UploadIcon from '~icons/lucide/upload';
import { useWebSocketActions, useWebSocketContext } from '../../hooks/useWebsocket';
import { useUpload } from '../../hooks/useUpload';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { m } from '../../paraglide/messages';
import { errorText } from '../../lib/errors';

// Checking and applying a backup goes through the WebUI and takes a while
const RESTORE_TIMEOUT_MS = 10 * 60 * 1000;

type Step = 'choose' | 'confirm' | 'done';

const restoreErrorMessage = (error: unknown) =>
  errorText(error, m.RESTORE_FAILED, {
    INVALID_BACKUP: m.RESTORE_INVALID,
    WRONG_KEY: m.RESTORE_WRONG_KEY,
    FIRMWARE_TOO_OLD: m.RESTORE_FIRMWARE_TOO_OLD,
  });

// Restoring a backup (.sbk) with the WebUI's own steps (cp_security.cgi):
// upload, check (security key?), apply, reboot. It replaces every setting
// of the CCU, so it is confirmed and the password is asked once more.
export const RestoreBackup = ({ onCancel }: { onCancel: () => void }) => {
  const { request } = useWebSocketActions();
  const upload = useUpload();
  const { authRequired } = useWebSocketContext();
  const [step, setStep] = useState<Step>('choose');
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [key, setKey] = useState('');
  const [id, setId] = useState('');
  const [needsKey, setNeedsKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const prepared = await request({ type: 'prepareRestore' }, { queue: false });
      await upload(prepared.url, file);
      const checked = await request(
        { type: 'checkRestore', id: prepared.id, password },
        { queue: false, timeoutMs: RESTORE_TIMEOUT_MS },
      );
      setId(prepared.id);
      setNeedsKey(checked.needsKey);
      setStep('confirm');
    } catch (e) {
      setError(restoreErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    setBusy(true);
    setError(null);
    try {
      await request({ type: 'restoreBackup', id, password, key }, { queue: false, timeoutMs: RESTORE_TIMEOUT_MS });
      setStep('done');
    } catch (e) {
      setError(restoreErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const errorLine = error && (
    <p role="alert" className="text-destructive">
      {error}
    </p>
  );

  if (step === 'done') {
    return (
      <ConfirmDialog title={m.RESTORE_TITLE()} confirmLabel={m.STATUS_OK()} onConfirm={onCancel} onCancel={onCancel}>
        <p role="status">{m.RESTORE_DONE()}</p>
      </ConfirmDialog>
    );
  }
  if (step === 'confirm') {
    return (
      <ConfirmDialog
        title={m.RESTORE_TITLE()}
        confirmLabel={busy ? m.RESTORE_RUNNING() : m.RESTORE_APPLY()}
        destructive
        busy={busy || (needsKey && key === '')}
        onConfirm={restore}
        onCancel={onCancel}
      >
        <div className="flex flex-col gap-3">
          <p>{m.RESTORE_CONFIRM({ name: file?.name ?? '' })}</p>
          {needsKey && (
            <label className="flex flex-col gap-1.5 text-sm text-muted-foreground">
              {m.RESTORE_KEY()}
              <Input
                type="password"
                aria-label={m.RESTORE_KEY()}
                autoComplete="off"
                value={key}
                onChange={(e) => setKey(e.target.value)}
              />
            </label>
          )}
          {errorLine}
        </div>
      </ConfirmDialog>
    );
  }
  return (
    <ConfirmDialog
      title={m.RESTORE_TITLE()}
      confirmLabel={busy ? m.RESTORE_CHECKING() : m.RESTORE_CHECK()}
      busy={busy || !file || (authRequired && password === '')}
      onConfirm={check}
      onCancel={onCancel}
    >
      <div className="flex flex-col gap-3">
        <p>{m.RESTORE_HINT()}</p>
        <label className="flex flex-col gap-1.5 text-sm text-muted-foreground">
          {m.RESTORE_FILE()}
          <input
            type="file"
            accept=".sbk"
            aria-label={m.RESTORE_FILE()}
            className="text-sm text-foreground file:mr-3 file:rounded-md file:border file:bg-transparent file:px-3 file:py-1.5 file:text-sm"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm text-muted-foreground">
          {authRequired ? m.BACKUP_PASSWORD_HINT() : m.BACKUP_PASSWORD_HINT_ADMIN()}
          <Input
            type="password"
            aria-label={m.PASSWORD()}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {errorLine}
      </div>
    </ConfirmDialog>
  );
};

export const RestoreButton = ({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) => (
  <Button type="button" variant="outline" disabled={disabled} onClick={onClick}>
    <UploadIcon />
    {m.RESTORE_TITLE()}
  </Button>
);
