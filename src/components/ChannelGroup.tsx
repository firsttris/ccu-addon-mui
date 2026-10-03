import { HTMLAttributes, ReactNode } from 'react';
import { TranslationKey, useTranslations } from '../i18n/utils';
import { Channel, ChannelStatus } from '../types/types';
import { controlOverrides } from '../controls/registry';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { ControlComponent } from './ControlComponent';
import UiwDown from '~icons/uiw/down';
import { m } from '../paraglide/messages';

const Card = ({ children }: { children: ReactNode }) => (
  <div className="bg-surface shadow-[0px_1px_3px_rgba(0,0,0,0.2)] border border-solid border-border rounded overflow-hidden flex flex-col">
    {children}
  </div>
);

// The values of an unreachable device are stale (often all 0)
const CardBody = ({ unreachable, children }: { unreachable: boolean; children: ReactNode }) => (
  <div className={`flex-1 flex justify-center ${unreachable ? 'opacity-45 grayscale' : ''}`}>{children}</div>
);

// Fills the card's width without making narrow cards wider
const StatusBar = ({ severity, children }: { severity: 'warning' | 'error'; children: ReactNode }) => (
  <div
    role="status"
    className={`w-0 min-w-full box-border px-2 py-1 text-[12px] font-semibold text-center text-text ${
      severity === 'error' ? 'bg-[rgba(244,67,54,0.2)]' : 'bg-[rgba(255,193,7,0.25)]'
    }`}
  >
    {children}
  </div>
);

const ChannelStatusBar = ({ status }: { status?: ChannelStatus }) => (
  <>
    {status?.UNREACH && <StatusBar severity="error">📡 {m.UNREACH()}</StatusBar>}
    {status?.LOW_BAT && <StatusBar severity="warning">🪫 {m.LOW_BAT()}</StatusBar>}
  </>
);

export const ListItem = ({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={`flex items-center py-2 px-4 border-b border-border cursor-pointer bg-background hover:bg-hover ${className}`}
    {...props}
  />
);

// Groups channels by device (the address before ":"), in order of appearance
const groupByDevice = <T extends Channel>(channels: T[]) => {
  const devices = new Map<string, T[]>();
  for (const channel of channels) {
    const deviceAddress = channel.address.split(':')[0];
    devices.set(deviceAddress, [...(devices.get(deviceAddress) ?? []), channel]);
  }
  return Array.from(devices);
};

interface ChannelGroupProps {
  channelType: string;
  channels: Channel[];
}

export const ChannelGroup: React.FC<ChannelGroupProps> = ({
  channelType,
  channels,
}) => {
  const t = useTranslations();
  const override = controlOverrides[channelType];

  const [expanded, setExpanded] = useLocalStorage(channelType, false);

  const handleExpandClick = () => {
    setExpanded(!expanded);
  };

  // Types without a translation (shown by GenericControl) keep the CCU's name
  const localizedText = t(channelType as TranslationKey);

  return (
    <div>
      <ListItem onClick={handleExpandClick}>
        <p className="text-text max-w-[300px] overflow-hidden whitespace-nowrap text-ellipsis font-semibold my-[10px] mx-0 text-[20px] max-[800px]:ml-[70px]">
          {localizedText}
        </p>
        <UiwDown
          width={30}
          className={`ml-auto transition-transform duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] text-[25px] ${
            expanded ? 'rotate-180' : 'rotate-0'
          }`}
        />
      </ListItem>
      <div className={expanded ? 'block' : 'hidden'}>
        <div className="mt-[15px] flex flex-wrap gap-[10px] max-[800px]:mx-[90px] max-[600px]:justify-center max-[600px]:mx-0">
          {override?.per === 'device'
            ? // One card per device instead of one per channel
              groupByDevice(channels).map(([deviceAddress, deviceChannels]) => (
                <Card key={deviceAddress}>
                  <CardBody unreachable={deviceChannels[0].status?.UNREACH === true}>
                    <override.component channels={deviceChannels} />
                  </CardBody>
                  <ChannelStatusBar status={deviceChannels[0].status} />
                </Card>
              ))
            : channels.map((channel) => (
                <Card key={channel.address}>
                  <CardBody unreachable={channel.status?.UNREACH === true}>
                    <ControlComponent channel={channel} />
                  </CardBody>
                  <ChannelStatusBar status={channel.status} />
                </Card>
              ))}
        </div>
        <hr className="w-full border-0 border-t border-solid border-border mt-4 mb-0" />
      </div>
    </div>
  );
};
