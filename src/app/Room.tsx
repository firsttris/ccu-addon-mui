import { useParams } from 'react-router-dom';
import { ChannelsForType } from './ChannelsForType';
import styled from '@emotion/styled';
import { useWebSocketContext } from 'src/hooks/useWebsocket';
import { useEffect, useMemo } from 'react';
import { Channel, ChannelType } from 'src/types/types';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 1280px; /* equivalent to maxWidth="xl" in MUI */
  margin: 0 auto; /* center the container */
`;

const List = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
`;

const LinearProgress = styled.div`
  width: 100%;
  height: 4px;
  background-color: #e0e0e0;
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: #3f51b5;
    animation: loading 1.5s infinite;
  }

  @keyframes loading {
    0% {
      left: -100%;
    }
    50% {
      left: 0;
    }
    100% {
      left: 100%;
    }
  }
`;

export const Room = () => {
  const { roomId } = useParams<{ roomId: string }>();

  const { getChannelsForRoomId, channels } = useWebSocketContext();

  useEffect(() => {
    getChannelsForRoomId(Number(roomId))
  }, [])

  const channelsPerType = useMemo(() => {
    return channels?.reduce((acc, channel) => {
      const channels = acc.get(channel.type);

      if (channels) {
        channels.push(channel);
      } else {
        acc.set(channel.type, [channel]);
      }

      return acc;
    }, new Map<ChannelType, Channel[]>());
  }, [channels]);

 // if (isLoading) {
 //   return <LinearProgress />;
 // }

  return (
    <Container>
      <List>
        {Array.from(channelsPerType).map(([channelType, channels], index) => {
          return channels.length ? (
            <ChannelsForType
              key={index}
              index={index}
              channelType={channelType}
              channels={channels}
            />
          ) : null;
        })}
      </List>
    </Container>
  );
};