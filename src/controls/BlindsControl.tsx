import { BlindVirtualReceiverChannel } from 'src/types/types';
import { Button } from '../components/Button';
import { Shutters } from '../components/icons/Shutters';
import { useWebSocketContext } from '../hooks/useWebsocket';
import { UiwDown } from '../components/icons/UiwDown';
import { UiwUp } from '../components/icons/UiwUp';
import { MaterialSymbolsStop } from '../components/icons/MaterialSymbolsStop';
import { ChannelName } from '../components/ChannelName';

interface ControlProps {
  channel: BlindVirtualReceiverChannel;
}

export const BlindsControl = ({ channel }: ControlProps) => {
  const { setDataPoint } = useWebSocketContext();
  const { datapoints, name, address, interfaceName } = channel;
  const blindValue = Number(datapoints.LEVEL) * 100;
  return (
    <div style={{ width: '250px', margin: '10px' }}>
      <ChannelName
        name={name}
        maxWidth='250px'
      />
      <div>
        <div
          style={{
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <div>
            {blindValue === 0 ? 'geschlossen' : `${blindValue} % geöffnet`}
          </div>
          <Shutters
            percent={blindValue}
            onLamellaClick={(percent) => {
              setDataPoint(interfaceName, address, 'LEVEL', percent / 100 );
            }}
          />
          <div
            style={{
              display: 'flex',
              gap: '50px',
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: '10px',
            }}
          >
            <Button
              onClick={() => setDataPoint(interfaceName, address, 'LEVEL', 0)}
            >
              <UiwDown />
            </Button>
            <Button
              onClick={() => setDataPoint(interfaceName, address, 'STOP', true)}
            >
              <MaterialSymbolsStop />
            </Button>
            <Button
              onClick={() => setDataPoint(interfaceName, address, 'LEVEL', 1)}
            >
              <UiwUp />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
