import styled from '@emotion/styled';
import { useEffect } from 'react';
import { ChannelGroup } from '../components/ChannelGroup';
import { useWebSocketContext } from '../hooks/useWebsocket';

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
  const { getAllChannels, sortedChannelsByType } = useWebSocketContext();

  useEffect(() => {
    getAllChannels();
  }, [getAllChannels]);

  return (
    <OuterContainer>
      <Container>
        <List>
          {sortedChannelsByType.map(([channelType, channels]) => (
            <ChannelGroup key={channelType} channelType={channelType} channels={channels} />
          ))}
        </List>
      </Container>
    </OuterContainer>
  );
};
