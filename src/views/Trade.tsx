import { useNavigate, useParams } from '@tanstack/react-router';
import { ChannelGroup } from '../components/ChannelGroup';
import styled from '@emotion/styled';
import { useWebSocketContext } from '../hooks/useWebsocket';
import { useEffect, useMemo } from 'react';
import { Channel, ChannelType } from '../types/types';
import { MdiMenu } from '../components/icons/MdiMenu';

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

const IconButton = styled.button`
  background: none;
  border: none;
  padding: 2px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #f0f0f0;

  @media (max-width: 600px) {
    padding: 8px;
  }

  &:hover {
    background-color: #e0e0e0;
    border-radius: 50%;
  }
`;

const Header = styled.div`
  position: fixed;
  display: flex;
  justify-content: space-between;
  align-items: center;
  //padding: 10px;
  //background-color: aliceblue;
  width: 100%;
  top: 0;
  left: 0;
  z-index: 1000;
  background-color: white;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  padding: 10px;
`;

const Title = styled.h1`
  margin: 0;
  font-size: 24px;
  font-weight: 600;
`;

export const Trade = () => {
  const navigate = useNavigate();
  const { tradeId } = useParams({ from: '/trade/$tradeId' });
  const { getChannelsForTrade, channels, trades } = useWebSocketContext();

  useEffect(() => {
    if (tradeId) {
      getChannelsForTrade(Number(tradeId));
    }
  }, [tradeId, getChannelsForTrade]);

  const trade = trades.find((t) => t.id === Number(tradeId));

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
        <IconButton onClick={() => navigate({ to: '/trades' })}>
          <MdiMenu />
        </IconButton>
        <Title>{trade?.name || 'Trade'}</Title>
        <div></div>
      </Header>
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
    </>
  );
};
