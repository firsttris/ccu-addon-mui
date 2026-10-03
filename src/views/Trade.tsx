import { useParams } from '@tanstack/react-router';
import { ChannelGroup } from '../components/ChannelGroup';
import { useChannels } from '../queries';

export const Trade: React.FC = () => {
  const { tradeId } = useParams({ from: '/trade/$tradeId' });
  const { channelsByType } = useChannels({ tradeId });

  return (
    <div className="m-[15px]">
      <div className="flex flex-col gap-[10px] max-w-[1280px] mx-auto pt-[60px]">
        <ul className="list-none p-0 m-0 flex flex-col gap-[10px]">
          {channelsByType.map(([channelType, channels]) => (
            <li key={channelType} className="flex flex-col gap-[10px]">
              <ChannelGroup channelType={channelType} channels={channels} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
