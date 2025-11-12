import { useParams } from '@tanstack/react-router';
import { ChannelGroup } from '../components/ChannelGroup';
import styled from '@emotion/styled';
import { useWebSocketContext } from '../hooks/useWebsocket';
import { useEffect, useMemo } from 'react';
import { Channel, ChannelType } from '../types/types';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 1280px;
  margin: 0 auto;
  padding-top: 25px;
`;

const List = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
`;

export const Room = () => {
  const { roomId } = useParams({ from: '/room/$roomId' });

  const { getChannelsForRoomId, channels } = useWebSocketContext();

  useEffect(() => {
    getChannelsForRoomId(Number(roomId));
  }, [roomId, getChannelsForRoomId]);

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

  return (
    <div style={{ margin: '15px' }}>
      <Container>
        <List>
          {Array.from(channelsPerType).map(([channelType, channels], index) => {
            return channels.length ? (
              <ChannelGroup
                key={index}
                index={index}
                channelType={channelType}
                channels={channels}
              />
            ) : null;
          })}
        </List>
      </Container>
    </div>
  );
};
