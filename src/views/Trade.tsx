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
  const { getChannelsForTrade, sortedChannelsByType } = useWebSocketContext();

  useEffect(() => {
    if (tradeId) {
      getChannelsForTrade(Number(tradeId));
    }
  }, [tradeId, getChannelsForTrade]);

  return (
    <div style={{ margin: '15px' }}>
      <Container>
        <List>
          {sortedChannelsByType.map(([channelType, channels]) => (
            <ListItem key={channelType}>
              <ChannelGroup channelType={channelType} channels={channels} />
            </ListItem>
          ))}
        </List>
      </Container>
    </div>
  );
};
