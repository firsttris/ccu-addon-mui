import { useState } from 'react';
import { Panel } from './Panel';
import { PanelSkeleton } from '../../components/ui/skeleton';
import { Backup } from './Backup';
import { Addons } from './Addons';
import { Logging } from './Logging';
import { SystemSettings } from './SystemSettings';
import { GeneralSettings } from './GeneralSettings';
import { Security } from './Security';
import { Network } from './Network';
import { Firewall } from './Firewall';
import { Certificate } from './Certificate';
import { useSystemInfo } from '../../queries';
import { usePageTitle } from '../../contexts/PageTitleContext';
import { Badge } from '../../components/ui/badge';
import { m } from '../../paraglide/messages';
import { cn } from '../../lib/utils';
import { DialogButton } from '../../components/ConfirmDialog';
import { useWebSocketActions, useWebSocketContext } from '../../hooks/useWebsocket';
import { CcuFirmwareButton, CcuFirmwareUpload } from './CcuFirmwareUpload';
import { DeviceFirmware } from './DeviceFirmware';
import { isNewerVersion } from '../../utils/version';
import { Button } from '../../components/ui/button';
import DownloadIcon from '~icons/lucide/circle-arrow-down';
import type { CheckFirmwareUpdateResponse } from '../../types/protocol';

export { isNewerVersion };

// Asks the update server for the newest firmware, as the WebUI's start page
// does (webui.js, homematic.com.init). OpenCCU can download it itself
// (cp_maintenance.cgi performDirectDownload), given the room it needs.
const FirmwareUpdate = ({ current }: { current: string }) => {
  const { request } = useWebSocketActions();
  const { elevated } = useWebSocketContext();
  const [result, setResult] = useState<CheckFirmwareUpdateResponse | 'failed' | null>(null);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const check = async () => {
    setBusy(true);
    try {
      setResult(await request({ type: 'checkFirmwareUpdate' }, { timeoutMs: 30000 }));
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
  if (!isNewerVersion(result.latest, current)) {
    return <span className="text-xs text-muted-foreground">{m.ADDONS_CURRENT()}</span>;
  }
  const tooLittleRoom = result.directDownload && (result.freeMb ?? 0) < (result.requiredMb ?? 0);
  return (
    <span className="flex flex-col items-start gap-1">
      <Badge variant="secondary">{m.ADDONS_NEWER({ version: result.latest })}</Badge>
      {result.directDownload ? (
        <>
          <Button
            type="button"
            className="h-7"
            disabled={!elevated || tooLittleRoom}
            onClick={() => setDownloading(true)}
          >
            <DownloadIcon />
            {m.CCUFW_DOWNLOAD_TITLE()}
          </Button>
          <span className={cn('text-xs', tooLittleRoom ? 'font-medium text-destructive' : 'text-muted-foreground')}>
            {m.CCUFW_FREE_SPACE({
              free: ((result.freeMb ?? 0) / 1024).toFixed(1),
              required: ((result.requiredMb ?? 0) / 1024).toFixed(1),
            })}
          </span>
        </>
      ) : (
        <span className="text-xs text-muted-foreground">{m.FW_UPDATE_HINT()}</span>
      )}
      {downloading && <CcuFirmwareUpload download={result.latest} onClose={() => setDownloading(false)} />}
    </span>
  );
};

export const SystemInfo = () => (
  <>
    <Versions />
    <SystemSettings />
    <GeneralSettings />
    <Network />
    <Security />
    <Firewall />
    <Certificate />
    <Addons />
    <DeviceFirmware />
    <Logging />
    <Backup />
  </>
);

// Versions and the radio modules with their duty cycle
const Versions = () => {
  usePageTitle(m.SETUP());
  const { data, isError } = useSystemInfo();
  const { elevated } = useWebSocketContext();
  const [uploading, setUploading] = useState(false);
  if (isError) {
    return null;
  }
  if (!data) {
    return (
      <Panel aria-label={m.SYSTEM()} aria-busy>
        <h2>{m.SYSTEM()}</h2>
        <PanelSkeleton lines={4} />
      </Panel>
    );
  }
  return (
    <Panel aria-label={m.SYSTEM()}>
      <h2>{m.SYSTEM()}</h2>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-muted-foreground">{m.ADDON_VERSION()}</dt>
        <dd>{data.addonVersion || import.meta.env.VITE_APP_VERSION || '–'}</dd>
        <dt className="text-muted-foreground">{m.FIRMWARE_VERSION()}</dt>
        <dd className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {data.firmwareVersion || '–'}
          {data.firmwareVersion && <FirmwareUpdate current={data.firmwareVersion} />}
          <CcuFirmwareButton disabled={!elevated} onClick={() => setUploading(true)} />
        </dd>
      </dl>
      {uploading && <CcuFirmwareUpload onClose={() => setUploading(false)} />}
      {data.radioInterfaces.length > 0 && (
        <>
          <h2 className="mt-3">{m.RADIO_MODULES()}</h2>
          <ul className="flex flex-col divide-y rounded-lg border" aria-label={m.RADIO_MODULES()}>
            {data.radioInterfaces.map((module) => {
              const percent = Math.min(100, module.dutyCycle);
              const bar =
                module.dutyCycle >= 80 ? 'bg-red-500' : module.dutyCycle >= 50 ? 'bg-amber-500' : 'bg-green-500';
              return (
                <li
                  key={`${module.interfaceName}-${module.address}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5 text-sm"
                >
                  <span className="min-w-[220px] font-medium">
                    {module.interfaceName}{' '}
                    <span className="font-mono text-xs text-muted-foreground">{module.address}</span>
                  </span>
                  <Badge variant={module.connected ? 'success' : 'destructive'}>
                    {module.connected ? m.CONNECTED() : m.DISCONNECTED()}
                  </Badge>
                  <div
                    className="h-2 w-40 overflow-hidden rounded-full bg-muted"
                    role="meter"
                    // The default module by its interface, LAN gateways also by serial
                    aria-label={`${m.DUTY_CYCLE()} ${module.interfaceName}${module.default ? '' : ` ${module.address}`}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={module.dutyCycle}
                  >
                    <div className={cn('h-full rounded-full', bar)} style={{ width: `${percent}%` }} />
                  </div>
                  <span className="tabular-nums text-muted-foreground">
                    {m.DUTY_CYCLE()} {module.dutyCycle} %
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="text-xs">{m.DUTY_CYCLE_HINT()}</p>
        </>
      )}
    </Panel>
  );
};
