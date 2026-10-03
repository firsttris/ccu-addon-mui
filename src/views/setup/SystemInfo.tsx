import { Panel } from './Panel';
import { PanelSkeleton } from '../../components/ui/skeleton';
import { Backup } from './Backup';
import { Addons } from './Addons';
import { SystemSettings } from './SystemSettings';
import { useSystemInfo } from '../../queries';
import { usePageTitle } from '../../contexts/PageTitleContext';
import { Badge } from '../../components/ui/badge';
import { m } from '../../paraglide/messages';
import { cn } from '../../lib/utils';

export const SystemInfo = () => (
  <>
    <Versions />
    <SystemSettings />
    <Addons />
    <Backup />
  </>
);

// Versions and the radio modules with their duty cycle
const Versions = () => {
  usePageTitle(m.SETUP());
  const { data, isError } = useSystemInfo();
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
        <dd>{data.firmwareVersion || '–'}</dd>
      </dl>
      {data.radioInterfaces.length > 0 && (
        <>
          <h2 className="mt-3">{m.RADIO_MODULES()}</h2>
          <ul className="flex flex-col divide-y rounded-lg border" aria-label={m.RADIO_MODULES()}>
            {data.radioInterfaces.map((module) => {
              const percent = Math.min(100, module.dutyCycle);
              const bar = module.dutyCycle >= 80 ? 'bg-red-500' : module.dutyCycle >= 50 ? 'bg-amber-500' : 'bg-green-500';
              return (
                <li key={`${module.interfaceName}-${module.address}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5 text-sm">
                  <span className="min-w-[220px] font-medium">
                    {module.interfaceName} <span className="font-mono text-xs text-muted-foreground">{module.address}</span>
                  </span>
                  <Badge variant={module.connected ? 'success' : 'destructive'}>
                    {module.connected ? m.CONNECTED() : m.DISCONNECTED()}
                  </Badge>
                  <div
                    className="h-2 w-40 overflow-hidden rounded-full bg-muted"
                    role="meter"
                    aria-label={`${m.DUTY_CYCLE()} ${module.interfaceName}`}
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
