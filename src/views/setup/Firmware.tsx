import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import DownloadIcon from '~icons/lucide/circle-arrow-down';
import { useInstallFirmware } from '../../queries';
import { useToast } from '../../contexts/ToastContext';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Button } from '../../components/ui/button';
import { Device } from '../../types/types';
import { m } from '../../paraglide/messages';

// While the CCU transfers or installs firmware, the state is reloaded now
// and then: the CCU sends no event for it.
const RUNNING_STATES = ['DELIVER_FIRMWARE_IMAGE', 'PERFORMING_UPDATE', 'LIVE_DELIVER_FIRMWARE_IMAGE'];
const RELOAD_MS = 30000;

export const firmwareStatus = (device: Device) => {
  const version = device.availableFirmware ?? '';
  switch (device.firmwareUpdateState) {
    case undefined:
      return version ? m.FIRMWARE_NEW_AVAILABLE({ version }) : m.FIRMWARE_NO_INFO();
    case 'UP_TO_DATE':
      return version ? m.FIRMWARE_NEW_AVAILABLE({ version }) : m.FIRMWARE_UP_TO_DATE();
    case 'NEW_FIRMWARE_AVAILABLE':
    case 'LIVE_NEW_FIRMWARE_AVAILABLE':
      return m.FIRMWARE_NEW_AVAILABLE({ version });
    case 'DELIVER_FIRMWARE_IMAGE':
    case 'LIVE_DELIVER_FIRMWARE_IMAGE':
      return m.FIRMWARE_DELIVERING({ version });
    case 'READY_FOR_UPDATE':
    case 'LIVE_READY_FOR_UPDATE':
      return m.FIRMWARE_READY({ version });
    case 'PERFORMING_UPDATE':
      return m.FIRMWARE_PERFORMING();
    default:
      return m.FIRMWARE_OTHER({ version, state: device.firmwareUpdateState });
  }
};

interface FirmwareProps {
  device: Device;
  canEdit: boolean;
}

// Installed and available firmware of a device; an update the CCU has
// delivered to the device can be installed from here.
export const Firmware = ({ device, canEdit }: FirmwareProps) => {
  const queryClient = useQueryClient();
  const installFirmware = useInstallFirmware();
  const { showToast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const state = device.firmwareUpdateState ?? '';
  const ready = state === 'READY_FOR_UPDATE' || state === 'LIVE_READY_FOR_UPDATE';

  const running = RUNNING_STATES.includes(state);
  useEffect(() => {
    if (!running) {
      return;
    }
    const timer = setInterval(() => queryClient.invalidateQueries({ queryKey: ['devices'] }), RELOAD_MS);
    return () => clearInterval(timer);
  }, [running, queryClient]);

  return (
    <>
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
        <dt className="text-muted-foreground">{m.INSTALLED()}</dt>
        <dd className="m-0 tabular-nums">{device.firmware || '–'}</dd>
        {device.availableFirmware && (
          <>
            <dt className="text-muted-foreground">{m.AVAILABLE()}</dt>
            <dd className="m-0 font-medium tabular-nums text-sky-700 dark:text-sky-300">{device.availableFirmware}</dd>
          </>
        )}
      </dl>
      <p role="status">{firmwareStatus(device)}</p>
      {canEdit && ready && (
        <Button type="button" className="w-fit" onClick={() => setConfirming(true)}>
          <DownloadIcon />
          {m.INSTALL_FIRMWARE()}
        </Button>
      )}
      {confirming && (
        <ConfirmDialog
          title={m.FIRMWARE_UPDATE()}
          confirmLabel={m.INSTALL_FIRMWARE()}
          busy={installFirmware.isPending}
          onCancel={() => setConfirming(false)}
          onConfirm={() =>
            installFirmware.mutate(
              { interfaceName: device.interfaceName, address: device.address },
              {
                onSuccess: () => showToast(m.FIRMWARE_UPDATE_STARTED(), 'info'),
                onError: (error) => showToast(`${m.CHANGE_FAILED()}: ${error.message}`),
                onSettled: () => setConfirming(false),
              },
            )
          }
        >
          <p>{m.INSTALL_FIRMWARE_CONFIRM({ version: device.availableFirmware ?? '' })}</p>
        </ConfirmDialog>
      )}
    </>
  );
};
