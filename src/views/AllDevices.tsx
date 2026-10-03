import styled from '@emotion/styled';
import { ChannelGroup } from '../components/ChannelGroup';
import { useChannels } from '../queries';

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

// All devices, also those not assigned to a room or trade
export const AllDevices = () => {
  const { channelsByType } = useChannels({ all: true });

  return (
    <OuterContainer>
      <Container>
        <List>
          {channelsByType.map(([channelType, channels]) => (
            <ChannelGroup key={channelType} channelType={channelType} channels={channels} />
          ))}
        </List>
      </Container>
    </OuterContainer>
  );
};
