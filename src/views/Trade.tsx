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
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const ListItem = styled.li`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

export const Trade: React.FC = () => {
  const { tradeId } = useParams({ from: '/trade/$tradeId' });
  const { getChannelsForTrade, channels, trades } = useWebSocketContext();

  const trade = trades.find((t) => t.id === Number(tradeId));

  useEffect(() => {
    if (tradeId) {
      getChannelsForTrade(Number(tradeId));
    }
  }, [tradeId, getChannelsForTrade]);

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
              <ListItem key={index}>
                <ChannelGroup
                  index={index}
                  channelType={channelType}
                  channels={channels}
                />
              </ListItem>
            ) : null;
          })}
        </List>
      </Container>
    </div>
  );
};
