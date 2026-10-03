import { BlindVirtualReceiverChannel } from '../types/types';
import { Shutters } from '../components/Shutters';
import { useSetDataPoint } from '../queries';
import UiwDown from '~icons/uiw/down';
import UiwUp from '~icons/uiw/up';
import MaterialSymbolsStop from '~icons/material-symbols/stop';
import { ChannelName } from '../components/ChannelName';
import { ControlButton } from '../components/ControlButton';
import { useTranslations } from '../i18n/utils';

interface ControlProps {
  channel: BlindVirtualReceiverChannel;
}

export const BlindsControl = ({ channel }: ControlProps) => {
  const t = useTranslations();
  const setDataPoint = useSetDataPoint();
  const { datapoints, name, address, interfaceName } = channel;
  // Rounded: e.g. 0.29 * 100 is 28.999999999999996 in floating point
  const blindValue = Math.round(Number(datapoints.LEVEL) * 100);
  return (
    <div style={{ width: '100%', maxWidth: '250px', margin: '10px' }}>
      <ChannelName name={name} maxWidth="100%" />
      <div>
        <div
          style={{
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <div style={{ fontSize: '13px', marginBottom: '5px' }}>
            {blindValue === 0
              ? t('BLIND_CLOSED')
              : `${blindValue} % ${t('BLIND_OPEN')}`}
          </div>
          <Shutters
            percent={blindValue}
            onLamellaClick={(percent) => {
              setDataPoint(interfaceName, address, 'LEVEL', percent / 100);
            }}
          />
          <div
            style={{
              display: 'flex',
              gap: '20px',
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: '10px',
            }}
          >
            <ControlButton
              onClick={() => setDataPoint(interfaceName, address, 'LEVEL', 0)}
            >
              <UiwDown />
            </ControlButton>
            <ControlButton
              onClick={() => setDataPoint(interfaceName, address, 'STOP', true)}
            >
              <MaterialSymbolsStop />
            </ControlButton>
            <ControlButton
              onClick={() => setDataPoint(interfaceName, address, 'LEVEL', 1)}
            >
              <UiwUp />
            </ControlButton>
          </div>
        </div>
      </div>
    </div>
  );
};
