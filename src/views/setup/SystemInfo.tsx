import styled from '@emotion/styled';
import { useSystemInfo } from '../../queries';
import { m } from '../../paraglide/messages';

const Panel = styled.section`
  margin: 16px 0;
  padding: 12px 16px;
  border: 1px solid ${(props) => props.theme.colors.border};
  border-radius: 8px;
  background: ${(props) => props.theme.colors.surface};

  h2 {
    margin: 0 0 8px;
    font-size: 16px;
  }

  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 4px 16px;
    margin: 0 0 12px;
  }

  dd {
    margin: 0;
  }
`;

const Bar = styled.div<{ percent: number }>`
  width: 160px;
  height: 10px;
  border-radius: 5px;
  background: rgba(158, 158, 158, 0.3);
  overflow: hidden;

  &::after {
    content: '';
    display: block;
    height: 100%;
    width: ${({ percent }) => Math.min(100, percent)}%;
    background: ${({ percent }) => (percent >= 80 ? '#c62828' : percent >= 50 ? '#f9a825' : '#43a047')};
  }
`;

const Module = styled.li`
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 4px 0;
`;

const Hint = styled.p`
  font-size: 12px;
  margin: 4px 0 0;
  color: ${(props) => props.theme.colors.textSecondary};
`;

// Versions and the radio modules with their duty cycle
export const SystemInfo = () => {
  const { data } = useSystemInfo();
  if (!data) {
    return null;
  }
  return (
    <Panel aria-label={m.SYSTEM()}>
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
              <Module key={`${module.interfaceName}-${module.address}`}>
                <span style={{ minWidth: 220 }}>
                  {module.interfaceName} · {module.address}
                </span>
                <span>{module.connected ? m.CONNECTED() : m.DISCONNECTED()}</span>
                <Bar
                  percent={module.dutyCycle}
                  role="meter"
                  aria-label={`${m.DUTY_CYCLE()} ${module.interfaceName}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={module.dutyCycle}
                />
                <span>
                  {m.DUTY_CYCLE()} {module.dutyCycle} %
                </span>
              </Module>
            ))}
          </ul>
          <Hint>{m.DUTY_CYCLE_HINT()}</Hint>
        </>
      )}
    </Panel>
  );
};
