import { useState } from 'react';
import DownloadIcon from '~icons/lucide/circle-arrow-down';
import { useWebSocketActions, useWebSocketContext } from '../../hooks/useWebsocket';
import { ConfirmDialog, DialogButton } from '../../components/ConfirmDialog';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { isNewerVersion } from '../../utils/version';
import { errorText } from '../../lib/errors';
import { lookForNewApp } from '../../lib/appUpdate';
import { m } from '../../paraglide/messages';
import type { CheckSelfUpdateResponse } from '../../types/protocol';

// Download, check and the update script take seconds, on a slow line minutes
const INSTALL_TIMEOUT_MS = 5 * 60 * 1000;

const installError = (error: unknown) =>
  errorText(error, m.SELF_UPDATE_FAILED, {
    CHECKSUM: m.SELF_UPDATE_CHECKSUM,
    UPDATE_RUNNING: m.SELF_UPDATE_ALREADY_RUNNING,
  });

// Checks GitHub for a new release of this add-on and installs it without
// rebooting the CCU (installSelfUpdate): the server runs the release's
// update_script, which replaces the files and restarts the server. The
// WebUI's Zusatzsoftware installs only at the next boot on a CCU3.
export const AddonSelfUpdate = ({ current }: { current: string }) => {
  const { request } = useWebSocketActions();
  const { elevated } = useWebSocketContext();
  const [result, setResult] = useState<CheckSelfUpdateResponse | 'failed' | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [installed, setInstalled] = useState<string | null>(null);
  const [doneOpen, setDoneOpen] = useState(false);

  const check = async () => {
    setBusy(true);
    try {
      setResult(await request({ type: 'checkSelfUpdate' }, { timeoutMs: 30000 }));
    } catch {
      setResult('failed');
    } finally {
      setBusy(false);
    }
  };

  const install = async () => {
    setInstalling(true);
    setError(null);
    try {
      const answer = await request({ type: 'installSelfUpdate' }, { queue: false, timeoutMs: INSTALL_TIMEOUT_MS });
      setConfirming(false);
      setInstalled(answer.version);
      setDoneOpen(true);
      // The update script replaced the app's files: the service worker
      // finds the new version now, and UpdatePrompt offers to reload
      void lookForNewApp();
    } catch (e) {
      setError(installError(e));
    } finally {
      setInstalling(false);
    }
  };

  if (installed) {
    return (
      <>
        <Badge variant="success">{m.SELF_UPDATE_INSTALLED({ version: installed })}</Badge>
        {doneOpen && (
          <ConfirmDialog
            title={m.SELF_UPDATE_TITLE()}
            confirmLabel={m.STATUS_OK()}
            onConfirm={() => setDoneOpen(false)}
            onCancel={() => setDoneOpen(false)}
          >
            <p role="status">{m.SELF_UPDATE_DONE({ version: installed })}</p>
          </ConfirmDialog>
        )}
      </>
    );
  }
  if (result === null) {
    return (
      <DialogButton type="button" className="h-7" disabled={busy} onClick={check}>
        {m.ADDONS_CHECK()}
      </DialogButton>
    );
  }
  if (result === 'failed') {
    return <span className="text-xs text-muted-foreground">{m.ADDONS_CHECK_FAILED()}</span>;
  }
  if (!isNewerVersion(result.latest, result.current || current)) {
    return <span className="text-xs text-muted-foreground">{m.ADDONS_CURRENT()}</span>;
  }
  return (
    <>
      <Badge variant="secondary">{m.ADDONS_NEWER({ version: result.latest })}</Badge>
      {result.installable ? (
        <Button type="button" className="h-7" disabled={!elevated} onClick={() => setConfirming(true)}>
          <DownloadIcon />
          {m.SELF_UPDATE_INSTALL()}
        </Button>
      ) : (
        <a
          href="https://github.com/firsttris/ccu-addon-mui/releases/latest"
          target="_blank"
          rel="noreferrer"
          className="text-xs font-medium underline underline-offset-4"
        >
          {m.CCUFW_GITHUB()}
        </a>
      )}
      {confirming && (
        <ConfirmDialog
          title={m.SELF_UPDATE_TITLE()}
          confirmLabel={installing ? m.SELF_UPDATE_RUNNING() : m.SELF_UPDATE_INSTALL()}
          busy={installing}
          onConfirm={install}
          onCancel={() => {
            if (!installing) setConfirming(false);
          }}
        >
          <div className="flex flex-col gap-3">
            <p>{m.SELF_UPDATE_CONFIRM({ version: result.latest })}</p>
            {installing && <p role="status" className="text-muted-foreground">{m.SELF_UPDATE_WAIT()}</p>}
            {error && (
              <p role="alert" className="text-destructive">
                {error}
              </p>
            )}
          </div>
        </ConfirmDialog>
      )}
    </>
  );
};
