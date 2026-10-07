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
import { AddonSelfUpdate } from './AddonSelfUpdate';
import { isNewerVersion } from '../../utils/version';
import { Button } from '../../components/ui/button';
import DownloadIcon from '~icons/lucide/circle-arrow-down';
import type { CheckFirmwareUpdateResponse, SystemState as State } from '../../types/protocol';
import { WEBUI_URL } from '../../components/WebUILink';
import { getLocale } from '../../paraglide/runtime';

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
  const newer = isNewerVersion(result.latest, current);
  if (!result.directDownload && !newer) {
    return <span className="text-xs text-muted-foreground">{m.ADDONS_CURRENT()}</span>;
  }
  return (
    <span className="flex flex-col items-start gap-1">
      {newer ? (
        <Badge variant="secondary">{m.ADDONS_NEWER({ version: result.latest })}</Badge>
      ) : (
        <span className="text-xs text-muted-foreground">{m.ADDONS_CURRENT()}</span>
      )}
      {result.directDownload ? (
        <>
          {/* Both ways of cp_maintenance.cgi: the CCU downloads and installs
              (performDirectDownload), or the file from GitHub's latest
              release, uploaded with "Firmware einspielen" */}
          <Button type="button" className="h-7" disabled={!elevated} onClick={() => setDownloading(true)}>
            <DownloadIcon />
            {m.CCUFW_DOWNLOAD_TITLE()}
          </Button>
          {result.freeMb !== undefined && (
            <span className="text-xs text-muted-foreground">
              {m.CCUFW_FREE_SPACE({ free: (result.freeMb / 1024).toFixed(1) })}
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {m.CCUFW_GITHUB_HINT()}:{' '}
            <a
              href="https://github.com/openccu/openccu/releases/latest"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-foreground underline underline-offset-4"
            >
              {m.CCUFW_GITHUB()}
            </a>
          </span>
        </>
      ) : (
        <span className="text-xs text-muted-foreground">{m.FW_UPDATE_HINT()}</span>
      )}
      {downloading && <CcuFirmwareUpload download={result.latest} onClose={() => setDownloading(false)} />}
    </span>
  );
};

export const SystemInfo = () => {
  // On openccu-lite its own interface has the system settings
  const { capabilities } = useWebSocketContext();
  return (
    <>
      <Versions />
      <Help />
      {capabilities.system && <SystemSettings />}
      <GeneralSettings />
      {capabilities.system && (
        <>
          <Network />
          <Security />
          <Firewall />
          <Certificate />
          <Addons />
        </>
      )}
      <DeviceFirmware />
      {capabilities.system && (
        <>
          <Logging />
          <Backup />
        </>
      )}
    </>
  );
};

// Versions and the radio modules with their duty cycle
const Versions = () => {
  usePageTitle(m.SETUP());
  const { data, isError } = useSystemInfo();
  const { elevated, capabilities } = useWebSocketContext();
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
        <dd className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {data.addonVersion || import.meta.env.VITE_APP_VERSION || '–'}
          {capabilities.selfUpdate && (
            <AddonSelfUpdate current={data.addonVersion || import.meta.env.VITE_APP_VERSION || ''} />
          )}
        </dd>
        <dt className="text-muted-foreground">{m.FIRMWARE_VERSION()}</dt>
        <dd className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {data.firmwareVersion || '–'}
          {capabilities.system && data.firmwareVersion && <FirmwareUpdate current={data.firmwareVersion} />}
          {capabilities.system && <CcuFirmwareButton disabled={!elevated} onClick={() => setUploading(true)} />}
        </dd>
        {data.product && (
          <>
            <dt className="text-muted-foreground">{m.SYS_PRODUCT()}</dt>
            <dd>{data.platform ? `${data.product} (${data.platform})` : data.product}</dd>
          </>
        )}
        {data.regaBuild && (
          <>
            <dt className="text-muted-foreground">{m.SYS_REGA_BUILD()}</dt>
            <dd>{data.regaBuild}</dd>
          </>
        )}
      </dl>
      {uploading && <CcuFirmwareUpload onClose={() => setUploading(false)} />}
      {data.system && <SystemState state={data.system} />}
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

const gigabytes = (bytes: number) =>
  `${new Intl.NumberFormat(getLocale(), { maximumFractionDigits: 1 }).format(bytes / 1024 ** 3)} GB`;
const percent = (value: number) =>
  `${new Intl.NumberFormat(getLocale(), { maximumFractionDigits: 1 }).format(value)} %`;

// "3 d 4 h 5 min", as help.cgi's uptime
export const formatUptime = (seconds: number) => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${days} d ${hours} h ${minutes} min`;
};

// The CCU's hardware and system, as the WebUI's help page lists them
// (help.cgi: CCU Hardware Info, Operating System Info)
const SystemState = ({ state }: { state: State }) => {
  const rows: [string, string][] = [];
  const add = (label: string, value: string | undefined | false) => {
    if (value) rows.push([label, value]);
  };
  add(m.SYS_MODEL(), state.model);
  add(m.SYS_SERIAL(), state.serial);
  add(m.SYS_CPU_MEMORY(), `${state.cpus}${state.memoryTotal ? `, ${gigabytes(state.memoryTotal)}` : ''}`);
  add(
    m.SYS_MEMORY_USE(),
    state.memoryUsed !== undefined &&
      `${percent(state.memoryUsed)}${state.swapUsed !== undefined ? ` · Swap ${percent(state.swapUsed)}` : ''}`,
  );
  add(m.SYS_UPTIME(), state.uptime !== undefined && formatUptime(state.uptime));
  add(m.SYS_LOAD(), state.load);
  add(
    m.SYS_TEMPERATURE(),
    state.temperature !== undefined &&
      `${new Intl.NumberFormat(getLocale(), { maximumFractionDigits: 1 }).format(state.temperature)} °C`,
  );
  add(m.SYS_OS(), state.os && state.kernel ? `${state.os} (${state.kernel})` : state.os || state.kernel);
  add(m.SYS_ROOT_FREE(), !!state.rootTotal && `${gigabytes(state.rootFree ?? 0)} / ${gigabytes(state.rootTotal)}`);
  add(m.SYS_USER_FREE(), !!state.userTotal && `${gigabytes(state.userFree ?? 0)} / ${gigabytes(state.userTotal)}`);
  return (
    <>
      <h2 className="mt-3">{m.SYS_CCU()}</h2>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {state.status.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label={m.SYS_STATUS()}>
          {state.status.map((flag) => (
            <li key={flag.name}>
              <Badge variant={flag.on ? 'success' : 'secondary'}>{flag.name}</Badge>
            </li>
          ))}
        </ul>
      )}
    </>
  );
};

// Help and licences, as the WebUI's help page links them (help.cgi): the
// OpenCCU documentation, eQ-3's service pages, the licences of the CCU's
// software, and this add-on's documentation and licence
const helpLinks = (): [string, string][] => [
  [m.HELP_ADDON_DOCS(), 'https://github.com/firsttris/ccu-addon-mui#readme'],
  [m.HELP_ADDON_LICENSE(), 'https://github.com/firsttris/ccu-addon-mui/blob/main/LICENSE'],
  [m.HELP_OPENCCU_DOCS(), 'https://github.com/openccu/openccu/wiki'],
  [m.HELP_HOMEMATIC(), 'http://www.eq-3.de/service.html'],
  [m.HELP_HOMEMATIC_IP(), 'https://www.homematic-ip.com/service.html'],
  [m.HELP_CCU_LICENSES(), `${WEBUI_URL.replace(/\/?$/, '/')}licenseinfo.htm`],
];

const Help = () => (
  <Panel aria-label={m.HELP()}>
    <h2>{m.HELP()}</h2>
    <ul className="flex flex-col gap-1.5 text-sm">
      {helpLinks().map(([label, href]) => (
        <li key={href}>
          <a
            className="text-primary underline-offset-4 hover:underline"
            href={href}
            target="_blank"
            rel="noopener noreferrer"
          >
            {label} ↗
          </a>
        </li>
      ))}
    </ul>
    <p className="text-xs">{m.HELP_COPYRIGHT()}</p>
  </Panel>
);
