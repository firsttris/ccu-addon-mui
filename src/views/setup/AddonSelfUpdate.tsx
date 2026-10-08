import { useState } from 'react';
import DownloadIcon from '~icons/lucide/circle-arrow-down';
import { useWebSocketActions } from '../../hooks/useWebsocket';
import { DialogButton } from '../../components/ConfirmDialog';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { UpdateWizard } from '../../components/update/UpdateWizard';
import { isNewerVersion } from '../../utils/version';
import { m } from '../../paraglide/messages';
import type { CheckSelfUpdateResponse } from '../../types/protocol';

// Checks GitHub for a new release of this add-on, now (force: not the
// server's last check) and installs it with the update wizard, as the
// notice on start does: without rebooting the CCU, the app reloads into the
// new version.
export const AddonSelfUpdate = ({ current }: { current: string }) => {
  const { request } = useWebSocketActions();
  const [result, setResult] = useState<CheckSelfUpdateResponse | 'failed' | null>(null);
  const [busy, setBusy] = useState(false);
  const [installing, setInstalling] = useState(false);

  const check = async () => {
    setBusy(true);
    try {
      setResult(await request({ type: 'checkSelfUpdate', force: true }, { timeoutMs: 30000 }));
    } catch {
      setResult('failed');
    } finally {
      setBusy(false);
    }
  };

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
        <Button type="button" className="h-7" onClick={() => setInstalling(true)}>
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
      {installing && <UpdateWizard version={result.latest} onClose={() => setInstalling(false)} />}
    </>
  );
};
