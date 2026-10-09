import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWebSocketActions } from '../../hooks/useWebsocket';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { PanelSkeleton } from '../../components/ui/skeleton';
import { useToast } from '../../contexts/ToastContext';
import { useChannelNames } from './channelNames';
import { m } from '../../paraglide/messages';
import type { InboxDevice } from '../../types/protocol';
import { errorText } from '../../lib/errors';

// Lets a new device from the inbox take the place of an existing one of the
// same kind, with its settings, links and programs, as the WebUI's
// Gerätetausch (ic_seldevice.cgi: listReplaceableDevices,
// Interface.changeDevice: replaceDevice). HmIP can't replace devices.
export const ReplaceDeviceDialog = ({ device, onDone }: { device: InboxDevice; onDone: () => void }) => {
  const { request } = useWebSocketActions();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const names = useChannelNames();
  const [old, setOld] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { data: candidates, isPending, isError } = useQuery({
    queryKey: ['replaceable', device.interfaceName, device.address],
    queryFn: async () =>
      (await request({ type: 'listReplaceableDevices', interfaceName: device.interfaceName, address: device.address })).devices,
    retry: false,
  });

  const replace = async () => {
    if (!old) return;
    setBusy(true);
    try {
      await request(
        { type: 'replaceDevice', interfaceName: device.interfaceName, address: device.address, oldAddress: old },
        { queue: false, timeoutMs: 60000 },
      );
      await Promise.all(['inbox', 'devices', 'channels'].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
      showToast(m.REPLACE_DONE({ name: names.get(old) ?? old }), 'info');
      onDone();
    } catch (error) {
      showToast(errorText(error, m.CHANGE_FAILED));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConfirmDialog
      title={m.REPLACE_TITLE()}
      confirmLabel={m.REPLACE_CONFIRM()}
      destructive
      busy={busy || !old}
      onConfirm={replace}
      onCancel={onDone}
    >
      <div className="flex flex-col gap-3">
        <p>{m.REPLACE_HINT({ name: device.name, type: device.type })}</p>
        {isPending && <PanelSkeleton lines={2} />}
        {isError && <p className="text-destructive">{m.REPLACE_FAILED_LIST()}</p>}
        {candidates && candidates.length === 0 && <p className="text-muted-foreground">{m.REPLACE_NONE()}</p>}
        {candidates && candidates.length > 0 && (
          <fieldset className="flex flex-col gap-1.5" aria-label={m.REPLACE_WHICH()}>
            <legend className="mb-1 text-xs text-muted-foreground">{m.REPLACE_WHICH()}</legend>
            {candidates.map((candidate) => (
              <label key={candidate.address} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="replace-old"
                  checked={old === candidate.address}
                  onChange={() => setOld(candidate.address)}
                />
                <span>
                  {names.get(candidate.address) ?? candidate.address}{' '}
                  <span className="font-mono text-xs text-muted-foreground">
                    {candidate.type} · {candidate.address}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
        )}
        {old && <p className="text-xs">{m.REPLACE_WARNING({ old: names.get(old) ?? old })}</p>}
      </div>
    </ConfirmDialog>
  );
};
