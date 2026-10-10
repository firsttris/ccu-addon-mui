import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWebSocketActions, useWebSocketContext } from '../../hooks/useWebsocket';
import { useUpload } from '../../hooks/useUpload';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Input } from '../../components/ui/input';
import { m } from '../../paraglide/messages';
import { errorText } from '../../lib/errors';

// Installing runs the add-on's own setup on the CCU and may take minutes
const INSTALL_TIMEOUT_MS = 15 * 60 * 1000;

const errorMessage = (error: unknown) => errorText(error, m.ADDON_INSTALL_FAILED);

// Installing an add-on (.tar.gz) with the WebUI's own steps
// (cp_software.cgi): upload, image_upload, install_go (/bin/install_addon);
// some add-ons need the CCU to restart.
export const AddonInstall = ({ onClose }: { onClose: () => void }) => {
  const { request } = useWebSocketActions();
  const upload = useUpload();
  const { authRequired } = useWebSocketContext();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<'installed' | 'reboot' | null>(null);

  const install = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const prepared = await request({ type: 'prepareAddonUpload' }, { queue: false });
      await upload(prepared.url, file);
      const installed = await request(
        { type: 'installAddon', id: prepared.id, password },
        { queue: false, timeoutMs: INSTALL_TIMEOUT_MS },
      );
      setResult(installed.reboot ? 'reboot' : 'installed');
      await queryClient.invalidateQueries({ queryKey: ['addons'] });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <ConfirmDialog title={m.ADDON_INSTALL()} confirmLabel={m.STATUS_OK()} onConfirm={onClose} onCancel={onClose}>
        <p role="status">{result === 'reboot' ? m.ADDON_INSTALLED_REBOOT() : m.ADDON_INSTALLED()}</p>
      </ConfirmDialog>
    );
  }
  return (
    <ConfirmDialog
      title={m.ADDON_INSTALL()}
      confirmLabel={busy ? m.ADDON_INSTALLING() : m.ADDON_INSTALL_GO()}
      busy={busy || !file || (authRequired && password === '')}
      onConfirm={install}
      onCancel={onClose}
    >
      <div className="flex flex-col gap-3">
        <p>{m.ADDON_INSTALL_HINT()}</p>
        <label className="flex flex-col gap-1.5 text-sm text-muted-foreground">
          {m.ADDON_FILE()}
          <input
            type="file"
            accept=".tar.gz,.tgz,application/gzip"
            aria-label={m.ADDON_FILE()}
            className="text-sm text-foreground file:mr-3 file:rounded-md file:border file:bg-transparent file:px-3 file:py-1.5 file:text-sm"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
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
        {busy && <p className="text-sm">{m.ADDON_INSTALL_WAIT()}</p>}
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
      </div>
    </ConfirmDialog>
  );
};
