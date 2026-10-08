import { useRef, useState } from 'react';
import { BACKUP_TIMEOUT_MS, download as downloadBackup } from './Backup';
import UploadIcon from '~icons/lucide/upload';
import { useWebSocketActions, useWebSocketContext } from '../../hooks/useWebsocket';
import { useUpload } from '../../hooks/useUpload';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { getLocale } from '../../paraglide/runtime';
import { m } from '../../paraglide/messages';
import { errorText } from '../../lib/errors';

// Uploading and checking an update goes through the WebUI and takes a while
const FIRMWARE_TIMEOUT_MS = 10 * 60 * 1000;
// The CCU downloading a full OpenCCU image takes longer (the server waits
// up to 30 minutes)
const DOWNLOAD_TIMEOUT_MS = 35 * 60 * 1000;

type Step = 'choose' | 'confirm' | 'done';

const errorMessage = (error: unknown) =>
  errorText(error, m.CCUFW_FAILED, {
    INVALID_FIRMWARE: m.CCUFW_INVALID,
    FIRMWARE_NOT_STAGED: m.CCUFW_NOT_STAGED,
    FIRMWARE_CHECKSUM: m.CCUFW_CHECKSUM,
    DOWNLOAD_FAILED: m.CCUFW_DOWNLOAD_FAILED,
  });

// Installing a firmware file on the CCU with the WebUI's own steps
// (cp_maintenance.cgi): upload and check (firmware_upload), the update's
// licence (EULA), then update_start: the CCU reboots into its recovery
// system and installs it. With download (the newest version) the CCU
// fetches the release itself instead (performDirectDownload: OpenCCU's
// CCU.downloadFirmware), and the server checks its SHA256 checksum.
export const CcuFirmwareUpload = ({ onClose, download }: { onClose: () => void; download?: string }) => {
  const { request } = useWebSocketActions();
  const upload = useUpload();
  const { authRequired } = useWebSocketContext();
  const [step, setStep] = useState<Step>('choose');
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [eula, setEula] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [backupFirst, setBackupFirst] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Closed while the CCU was still downloading or checking: what it then
  // stages for the update is removed again (firmware_update_cancel)
  const closedRef = useRef(false);
  const cancelLater = () => {
    if (closedRef.current) {
      request({ type: 'cancelCcuFirmware', password }, { queue: false }).catch(() => undefined);
      return true;
    }
    return false;
  };

  const check = async () => {
    if (download) {
      setBusy(true);
      setError(null);
      try {
        const checked = await request(
          { type: 'downloadCcuFirmware', password, language: getLocale() === 'en' ? 'en' : 'de' },
          { queue: false, timeoutMs: DOWNLOAD_TIMEOUT_MS },
        );
        if (cancelLater()) return;
        setEula(checked.eula ?? '');
        setStep('confirm');
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setBusy(false);
      }
      return;
    }
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const prepared = await request({ type: 'prepareCcuFirmware' }, { queue: false });
      await upload(prepared.url, file);
      const checked = await request(
        { type: 'checkCcuFirmware', id: prepared.id, password, language: getLocale() === 'en' ? 'en' : 'de' },
        { queue: false, timeoutMs: FIRMWARE_TIMEOUT_MS },
      );
      if (cancelLater()) return;
      setEula(checked.eula ?? '');
      setStep('confirm');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const install = async () => {
    setBusy(true);
    setError(null);
    try {
      // As the WebUI offers before the update (askCreateBackup, ticked)
      if (backupFirst) {
        const backup = await request({ type: 'createBackup', password }, { queue: false, timeoutMs: BACKUP_TIMEOUT_MS });
        downloadBackup(backup.url, backup.fileName);
      }
      await request({ type: 'installCcuFirmware', password }, { queue: false, timeoutMs: FIRMWARE_TIMEOUT_MS });
      setStep('done');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  // A checked file waits on the CCU: removed again when cancelled
  const cancel = () => {
    closedRef.current = true;
    if (step === 'confirm') {
      request({ type: 'cancelCcuFirmware', password }, { queue: false }).catch(() => undefined);
    }
    onClose();
  };

  const errorLine = error && (
    <p role="alert" className="text-destructive">
      {error}
    </p>
  );

  if (step === 'done') {
    return (
      <ConfirmDialog title={m.CCUFW_TITLE()} confirmLabel={m.STATUS_OK()} onConfirm={onClose} onCancel={onClose}>
        <p role="status">{m.CCUFW_DONE()}</p>
      </ConfirmDialog>
    );
  }
  if (step === 'confirm') {
    return (
      <ConfirmDialog
        title={m.CCUFW_TITLE()}
        confirmLabel={busy ? m.CCUFW_STARTING() : m.CCUFW_INSTALL()}
        destructive
        busy={busy || (eula !== '' && !accepted)}
        onConfirm={install}
        onCancel={cancel}
      >
        <div className="flex flex-col gap-3">
          <p>{m.CCUFW_CONFIRM({ name: download ? `OpenCCU ${download}` : (file?.name ?? '') })}</p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={backupFirst} onChange={(e) => setBackupFirst(e.target.checked)} />
            {m.CCUFW_BACKUP_FIRST()}
          </label>
          {eula && (
            <>
              <pre
                aria-label={m.CCUFW_EULA()}
                className="max-h-48 overflow-auto rounded-md border bg-muted/40 p-2 text-xs whitespace-pre-wrap text-foreground"
              >
                {eula}
              </pre>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
                {m.CCUFW_ACCEPT()}
              </label>
            </>
          )}
          {errorLine}
        </div>
      </ConfirmDialog>
    );
  }
  return (
    <ConfirmDialog
      title={download ? m.CCUFW_DOWNLOAD_TITLE() : m.CCUFW_TITLE()}
      confirmLabel={
        download ? (busy ? m.CCUFW_DOWNLOADING() : m.CCUFW_DOWNLOAD()) : busy ? m.CCUFW_CHECKING() : m.CCUFW_CHECK()
      }
      busy={busy || (!download && !file) || (authRequired && password === '')}
      onConfirm={check}
      onCancel={cancel}
    >
      <div className="flex flex-col gap-3">
        <p>{download ? m.CCUFW_DOWNLOAD_HINT({ version: download }) : m.CCUFW_HINT()}</p>
        {!download && (
          <label className="flex flex-col gap-1.5 text-sm text-muted-foreground">
            {m.CCUFW_FILE()}
            <input
              type="file"
              accept=".zip,.tgz,.tar.gz,.img,application/zip,application/gzip"
              aria-label={m.CCUFW_FILE()}
              className="text-sm text-foreground file:mr-3 file:rounded-md file:border file:bg-transparent file:px-3 file:py-1.5 file:text-sm"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
        )}
        <label className="flex flex-col gap-1.5 text-sm text-muted-foreground">
          {m.CCUFW_PASSWORD()}
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

export const CcuFirmwareButton = ({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) => (
  <Button type="button" variant="outline" className="h-7" disabled={disabled} onClick={onClick}>
    <UploadIcon />
    {m.CCUFW_TITLE()}
  </Button>
);
