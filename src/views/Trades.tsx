import { useNavigate } from '@tanstack/react-router';
import styled from '@emotion/styled';
import { ListItem } from '../components/ChannelGroup';
import { useWebSocketContext } from '../hooks/useWebsocket';
import { useEffect } from 'react';

const Container = styled.div`
  max-width: 1280px;
  margin: 0 auto;
  padding: 16px;
  padding-top: 60px;
`;

const List = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
`;

export const ListItemText = styled.p`
  color: ${props => props.theme.colors.text};
  max-width: 300px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-weight: 600;
  margin: 10px 0;
  font-size: 20px;
  margin-left: 20px;
`;

export const Trades = () => {
  const navigate = useNavigate();
  const { getTrades, trades, setChannels } = useWebSocketContext();

  useEffect(() => {
    getTrades();
  }, []);

  if (trades) {
    return (
      <Container>
        <List>
          {trades.map((trade, index) => (
            <ListItem
              key={index}
              onClick={() => {
                setChannels([]);
                navigate({
                  to: '/trade/$tradeId',
                  params: { tradeId: trade.id.toString() },
                });
              }}
            >
              <ListItemText>{trade.name}</ListItemText>
            </ListItem>
          ))}
        </List>
      </Container>
    );
  }

  return <div>Loading trades...</div>;
};
