import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import DownloadIcon from '~icons/lucide/circle-arrow-down';
import { useInstallFirmware } from '../../queries';
import { useToast } from '../../contexts/ToastContext';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Button } from '../../components/ui/button';
import { Device } from '../../types/types';
import { RequestError } from '../../hooks/useWebsocket';
import { m } from '../../paraglide/messages';

// While the CCU transfers or installs firmware, the state is reloaded now
// and then: the CCU sends no event for it. Right after an update was
// started it is reloaded every 5 s for 10.5 minutes, as the WebUI does for
// access points (ic_ifacecmd.cgi: the HmIP service gives up after 10).
const RUNNING_STATES = [
  'DELIVER_FIRMWARE_IMAGE',
  'PERFORMING_UPDATE',
  'LIVE_DELIVER_FIRMWARE_IMAGE',
  'DO_UPDATE_PENDING',
];
const RELOAD_MS = 30000;
const WATCH_RELOAD_MS = 5000;
const WATCH_MS = 630000;

const isHmIP = (device: Device) => device.interfaceName === 'HmIP-RF' || device.interfaceName === 'HmIP-Wired';

// Access points that only update live from firmware 2.1 on, and those that
// update on their own (ic_deviceFirmwareOverview.cgi)
const LIVE_UPDATE_TYPES = ['HmIPW-DRAP', 'HmIP-HAP', 'HmIP-HAP-A', 'HmIP-HAP-B1', 'HmIP-HAP JS1'];
const AUTOMATIC_UPDATE_TYPES = ['HmIP-HAP2', 'HmIP-HAP2-A'];
const BEFORE_LIVE_UPDATE = /^([01]\.\d+\.\d+|2\.0\.\d+)/;

// What the update button does, as in the WebUI's firmware overview
// (ic_deviceFirmwareOverview.cgi): install starts the update, the others
// only explain why there is nothing to start; undefined: no button.
export type UpdateAction = 'install' | 'unsupported' | 'automatic';

export const updateAction = (device: Device): UpdateAction | undefined => {
  if (!isHmIP(device)) {
    // BidCos: updateFirmware transfers and installs what the CCU has
    return device.availableFirmware ? 'install' : undefined;
  }
  switch (device.firmwareUpdateState) {
    case 'READY_FOR_UPDATE':
    case 'DO_UPDATE_PENDING':
      return 'install';
    case 'LIVE_NEW_FIRMWARE_AVAILABLE':
      if (LIVE_UPDATE_TYPES.includes(device.type) && BEFORE_LIVE_UPDATE.test(device.firmware ?? '')) {
        return 'unsupported';
      }
      return AUTOMATIC_UPDATE_TYPES.includes(device.type) ? 'automatic' : 'install';
    default:
      return undefined;
  }
};

export const firmwareStatus = (device: Device) => {
  const version = device.availableFirmware ?? '';
  if (!isHmIP(device)) {
    return version ? m.FIRMWARE_BIDCOS_AVAILABLE({ version }) : m.FIRMWARE_NO_INFO();
  }
  switch (device.firmwareUpdateState) {
    case undefined:
      return version ? m.FIRMWARE_NEW_AVAILABLE({ version }) : m.FIRMWARE_NO_INFO();
    case 'UP_TO_DATE':
    case 'LIVE_UP_TO_DATE':
      return version ? m.FIRMWARE_NEW_AVAILABLE({ version }) : m.FIRMWARE_UP_TO_DATE();
    case 'NEW_FIRMWARE_AVAILABLE':
      return m.FIRMWARE_NEW_AVAILABLE({ version });
    case 'LIVE_NEW_FIRMWARE_AVAILABLE':
      return m.FIRMWARE_LIVE_AVAILABLE({ version });
    case 'DELIVER_FIRMWARE_IMAGE':
      return m.FIRMWARE_DELIVERING({ version });
    case 'READY_FOR_UPDATE':
      return m.FIRMWARE_READY({ version });
    case 'DO_UPDATE_PENDING':
      return m.FIRMWARE_PENDING({ version });
    case 'PERFORMING_UPDATE':
    case 'LIVE_DELIVER_FIRMWARE_IMAGE':
      return m.FIRMWARE_PERFORMING();
    default:
      return m.FIRMWARE_OTHER({ version, state: device.firmwareUpdateState });
  }
};

const installError = (error: Error) => {
  if (error instanceof RequestError && error.code === 'DEVICE_UNREACHABLE') {
    return m.FIRMWARE_DEVICE_UNREACHABLE();
  }
  if (error instanceof RequestError && error.code === 'DUTY_CYCLE_HIGH') {
    return m.FIRMWARE_DUTY_CYCLE_HIGH();
  }
  return `${m.CHANGE_FAILED()}: ${error.message}`;
};

interface FirmwareProps {
  device: Device;
  canEdit: boolean;
}

// Installed and available firmware of a device; an update the CCU has for
// the device can be started from here (FirmwareUpdate in webui.js).
export const Firmware = ({ device, canEdit }: FirmwareProps) => {
  const queryClient = useQueryClient();
  const installFirmware = useInstallFirmware();
  const { showToast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const action = updateAction(device);
  // Until when the state is reloaded quickly after starting an update
  const [watchUntil, setWatchUntil] = useState(0);
  const watching = watchUntil > 0;

  const running = RUNNING_STATES.includes(device.firmwareUpdateState ?? '');
  useEffect(() => {
    if (!running && !watching) {
      return;
    }
    const timer = setInterval(
      () => queryClient.invalidateQueries({ queryKey: ['devices'] }),
      watching ? WATCH_RELOAD_MS : RELOAD_MS,
    );
    const stop = watching ? setTimeout(() => setWatchUntil(0), watchUntil - Date.now()) : undefined;
    return () => {
      clearInterval(timer);
      clearTimeout(stop);
    };
  }, [running, watching, watchUntil, queryClient]);

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
      {canEdit && action && (
        <Button
          type="button"
          className="w-fit"
          onClick={() => {
            if (action === 'install') {
              setConfirming(true);
            } else {
              showToast(action === 'automatic' ? m.FIRMWARE_AUTOMATIC() : m.FIRMWARE_UNSUPPORTED(), 'info');
            }
          }}
        >
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
                onSuccess: () => {
                  showToast(m.FIRMWARE_UPDATE_STARTED(), 'info');
                  setWatchUntil(Date.now() + WATCH_MS);
                },
                onError: (error) => showToast(installError(error)),
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
