import { useNavigate, useParams } from 'react-router-dom';
import { ChannelsForType } from './ChannelsForType';
import styled from '@emotion/styled';
import { useWebSocketContext } from './../hooks/useWebsocket';
import { useEffect, useMemo } from 'react';
import { Channel, ChannelType } from './../types/types';
import { Icon } from '@iconify/react';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 1280px;
  margin: 0 auto; 
`;

const List = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
`;

const IconButton = styled.button`
  background: none;
  border: none;
  padding: 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;

  @media (max-width: 600px) {
    padding: 8px;
  }

  &:hover {
    background-color: rgba(0, 0, 0, 0.1);
    border-radius: 50%;
  }
`;

const Header = styled.div`
  position: fixed;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px;

  @media (max-width: 1024px) {
    position: relative;
  }
`;

export const Room = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();

  const { getChannelsForRoomId, channels } = useWebSocketContext();

  useEffect(() => {
    getChannelsForRoomId(Number(roomId));
  }, []);

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
    <>
      <Header>
        <IconButton onClick={() => navigate('/')} aria-label="Back to home">
          <Icon icon="mdi:menu" fontSize={24} />
        </IconButton>
      </Header>
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
    </>
  );
};
