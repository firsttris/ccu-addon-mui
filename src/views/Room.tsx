import { useParams } from '@tanstack/react-router';
import { ChannelGroup } from '../components/ChannelGroup';
import styled from '@emotion/styled';
import { useWebSocketContext } from '../hooks/useWebsocket';
import { useEffect } from 'react';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 1280px;
  margin: 0 auto;
  padding-top: 60px;

  @media (max-width: 400px) {
    padding-top: 80px;
  }
`;

const OuterContainer = styled.div`
  margin: 15px;

  @media (max-width: 400px) {
    margin: 5px;
  }
`;

const List = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
`;

export const Room = () => {
  const { roomId } = useParams({ from: '/room/$roomId' });

  const { getChannelsForRoomId, sortedChannelsByType } = useWebSocketContext();

  useEffect(() => {
    getChannelsForRoomId(Number(roomId));
  }, [roomId, getChannelsForRoomId]);

  return (
    <OuterContainer>
      <Container>
        <List>
          {sortedChannelsByType.map(([channelType, channels], index) => {
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
    </OuterContainer>
  );
};
