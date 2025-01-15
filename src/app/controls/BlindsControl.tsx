import { ChannelHeader } from '../components/ChannelHeader';
import { BlindVirtualReceiverChannel } from 'src/types/types';
import { Button } from '../components/Button';
import { Icon } from '@iconify/react';
import { Shutters } from '../components/ShuttersSvg';
import { useWebSocketContext } from './../../hooks/useWebsocket';

interface ControlProps {
  channel: BlindVirtualReceiverChannel;
}

export const BlindsControl = ({ channel }: ControlProps) => {
  const { setDataPoint } = useWebSocketContext();
  const { datapoints, name, address, interfaceName } = channel;
  const blindValue = Number(datapoints.LEVEL) * 100;
  return (
    <div>
      <ChannelHeader icon={blindValue === 0 ? "material-symbols-light:blinds-closed" : "material-symbols-light:blinds"} name={name}/>
      <div style={{ paddingTop: '0px' }}>
        <div
          style={{
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <div>
            {blindValue}%
          </div>
          <Shutters percent={blindValue} />
          <div
            style={{
              display: 'flex',
              gap: '5px',
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: '10px',
              marginBottom: '10px',
            }}
          >
            <Button onClick={() => setDataPoint(interfaceName, address, 'LEVEL', 0)}>
              <Icon icon="uiw:down" />
            </Button>
            <Button onClick={() => setDataPoint(interfaceName, address, 'STOP', true)}>
              <Icon icon="material-symbols:stop" />
            </Button>
            <Button onClick={() => setDataPoint(interfaceName, address, 'LEVEL', 1)}>
              <Icon icon="uiw:up" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
