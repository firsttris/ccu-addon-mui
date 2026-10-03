import { CSSProperties } from 'react';
import { Panel } from './Panel';
import { useSystemInfo } from '../../queries';
import { m } from '../../paraglide/messages';

// Versions and the radio modules with their duty cycle
export const SystemInfo = () => {
  const { data } = useSystemInfo();
  if (!data) {
    return null;
  }
  return (
    <Panel aria-label={m.SYSTEM()} className="[&_dl]:grid [&_dl]:grid-cols-[max-content_1fr] [&_dl]:gap-x-4 [&_dl]:gap-y-1 [&_dl]:mt-0 [&_dl]:mx-0 [&_dl]:mb-3 [&_dd]:m-0">
      <h2>{m.SYSTEM()}</h2>
      <dl>
        <dt>{m.ADDON_VERSION()}</dt>
        <dd>{data.addonVersion || import.meta.env.VITE_APP_VERSION || '–'}</dd>
        <dt>{m.FIRMWARE_VERSION()}</dt>
        <dd>{data.firmwareVersion || '–'}</dd>
      </dl>
      {data.radioInterfaces.length > 0 && (
        <>
          <strong>{m.RADIO_MODULES()}</strong>
          <ul style={{ listStyle: 'none', padding: 0, margin: '4px 0 0' }} aria-label={m.RADIO_MODULES()}>
            {data.radioInterfaces.map((module) => (
              <li key={`${module.interfaceName}-${module.address}`} className="flex items-center gap-3 flex-wrap py-1 px-0">
                <span style={{ minWidth: 220 }}>
                  {module.interfaceName} · {module.address}
                </span>
                <span>{module.connected ? m.CONNECTED() : m.DISCONNECTED()}</span>
                <div
                  style={
                    {
                      '--percent': `${Math.min(100, module.dutyCycle)}%`,
                      '--bar': module.dutyCycle >= 80 ? '#c62828' : module.dutyCycle >= 50 ? '#f9a825' : '#43a047',
                    } as CSSProperties
                  }
                  className="w-40 h-[10px] rounded-[5px] bg-[rgba(158,158,158,0.3)] overflow-hidden after:content-[''] after:block after:h-full after:w-(--percent) after:bg-(--bar)"
                  role="meter"
                  aria-label={`${m.DUTY_CYCLE()} ${module.interfaceName}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={module.dutyCycle}
                />
                <span>
                  {m.DUTY_CYCLE()} {module.dutyCycle} %
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[12px] mt-1 mx-0 mb-0 text-text-secondary">{m.DUTY_CYCLE_HINT()}</p>
        </>
      )}
    </Panel>
  );
};
