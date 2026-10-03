import { useParams } from '@tanstack/react-router';
import { ChannelGroup } from '../components/ChannelGroup';
import styled from '@emotion/styled';
import { useChannels } from '../queries';

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
  const { channelsByType } = useChannels({ tradeId });

  return (
    <div style={{ margin: '15px' }}>
      <Container>
        <List>
          {channelsByType.map(([channelType, channels]) => (
            <ListItem key={channelType}>
              <ChannelGroup channelType={channelType} channels={channels} />
            </ListItem>
          ))}
        </List>
      </Container>
    </div>
  );
};
