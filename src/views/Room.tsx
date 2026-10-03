import { useParams } from '@tanstack/react-router';
import { ChannelGroup } from '../components/ChannelGroup';
import { useChannels } from '../queries';

export const Room = () => {
  const { roomId } = useParams({ from: '/room/$roomId' });

  const { channelsByType } = useChannels({ roomId });

  return (
    <div className="m-[15px] max-[400px]:m-[5px]">
      <div className="flex flex-col gap-[10px] max-w-[1280px] mx-auto pt-[60px] max-[400px]:pt-[80px]">
        <ul className="list-none p-0 m-0">
          {channelsByType.map(([channelType, channels]) => (
            <ChannelGroup key={channelType} channelType={channelType} channels={channels} />
          ))}
        </ul>
      </div>
    </div>
  );
};
