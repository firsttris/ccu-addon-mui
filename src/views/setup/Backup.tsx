import { useState } from 'react';
import ArchiveIcon from '~icons/lucide/archive';
import { RequestError, useWebSocketActions, useWebSocketContext } from '../../hooks/useWebsocket';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ElevateDialog } from '../../components/ElevateDialog';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { useToast } from '../../contexts/ToastContext';
import { defaultLang } from '../../i18n/locale';
import { Panel } from './Panel';
import { RestoreBackup, RestoreButton } from './RestoreBackup';
import { PanelSkeleton } from '../../components/ui/skeleton';
import { m } from '../../paraglide/messages';
import { errorText } from '../../lib/errors';

// Creating a backup packs all of /usr/local on the CCU: that takes a while
export const BACKUP_TIMEOUT_MS = 5 * 60 * 1000;

const sizeFormat = new Intl.NumberFormat(defaultLang, { maximumFractionDigits: 1 });
const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${sizeFormat.format(bytes / 1024 / 1024)} MB` : `${sizeFormat.format(bytes / 1024)} kB`;

// Saves what the server hands out once under a random address (a backup,
// the log files)
export const download = (url: string, fileName: string) => {
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
};

const errorMessage = (error: unknown) => errorText(error, m.BACKUP_FAILED, { TIMEOUT: m.BACKUP_TIMEOUT });

// Creates a backup (.sbk) of the CCU with the WebUI's own routine and
// downloads it. It holds every setting and password, so the password is
// asked once more; restoring stays in the WebUI.
export const Backup = () => {
  const { request } = useWebSocketActions();
  const { userLevel, elevated, authRequired } = useWebSocketContext();
  const { showToast } = useToast();
  const [asking, setAsking] = useState(false);
  const [elevating, setElevating] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<{ fileName: string; size: number } | null>(null);
  const [restoring, setRestoring] = useState(false);

  if (userLevel === '') {
    return (
      <Panel aria-label={m.BACKUP()} aria-busy>
        <h2>{m.BACKUP()}</h2>
        <PanelSkeleton lines={2} />
      </Panel>
    );
  }
  if (userLevel !== 'admin') {
    return null;
  }

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await request(
        { type: 'createBackup', password },
        { queue: false, timeoutMs: BACKUP_TIMEOUT_MS },
      );
      download(response.url, response.fileName);
      setLast({ fileName: response.fileName, size: response.size });
      setAsking(false);
      setPassword('');
      showToast(m.BACKUP_CREATED(), 'info');
    } catch (e) {
      if (e instanceof RequestError && e.code === 'ELEVATION_REQUIRED') {
        setAsking(false);
        setElevating(true);
      } else {
        setError(errorMessage(e));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel aria-label={m.BACKUP()}>
      <h2>{m.BACKUP()}</h2>
      <p>{m.BACKUP_HINT()}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={() => (elevated ? setAsking(true) : setElevating(true))}>
          <ArchiveIcon />
          {m.CREATE_BACKUP()}
        </Button>
        <RestoreButton onClick={() => (elevated ? setRestoring(true) : setElevating(true))} />
        {last && (
          <span role="status" className="text-sm text-muted-foreground">
            {last.fileName} · {formatSize(last.size)}
          </span>
        )}
      </div>
      {restoring && <RestoreBackup onCancel={() => setRestoring(false)} />}

      {asking && (
        <ConfirmDialog
          title={m.CREATE_BACKUP()}
          confirmLabel={busy ? m.BACKUP_RUNNING() : m.CREATE_BACKUP()}
          busy={busy || (authRequired && password === '')}
          onConfirm={create}
          onCancel={() => {
            setAsking(false);
            setError(null);
            setPassword('');
          }}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!busy) {
                create();
              }
            }}
          >
            <label className="flex flex-col gap-3 text-muted-foreground">
              {authRequired ? m.BACKUP_PASSWORD_HINT() : m.BACKUP_PASSWORD_HINT_ADMIN()}
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
            {busy && <p className="mt-2 text-sm">{m.BACKUP_WAIT()}</p>}
            {error && (
              <p role="alert" className="mt-2 text-destructive">
                {error}
              </p>
            )}
          </form>
        </ConfirmDialog>
      )}
      {elevating && (
        <ElevateDialog
          onDone={() => {
            setElevating(false);
            setAsking(true);
          }}
          onCancel={() => setElevating(false)}
        />
      )}
    </Panel>
  );
};
