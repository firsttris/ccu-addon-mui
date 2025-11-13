import { useNavigate } from '@tanstack/react-router';
import styled from '@emotion/styled';
import { ListItem } from '../components/ChannelGroup';
import { useWebSocketContext } from '../hooks/useWebsocket';
import { useEffect } from 'react';
import { TeenyiconsFloorplanSolid } from '../components/icons/TeenyiconsFloorplanSolid';

const Container = styled.div`
  max-width: 1280px;
  margin: 0 auto;
  padding: 16px;
`;

const List = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
`;

export const ListItemText = styled.p({
  color: '#000',
  maxWidth: '300px',
  overflow: 'hidden',
  whiteSpace: 'wrap',
  textOverflow: 'ellipsis',
  fontWeight: 600,
  margin: '10px 0',
  fontSize: '20px',
  marginLeft: '20px',
});

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
