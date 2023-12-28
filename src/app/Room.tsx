import { Container, LinearProgress, List, styled } from '@mui/material';
import { useParams } from 'react-router-dom';
import { useGetChannelForType } from '../hooks/useApi';
import { ChannelsForType } from './ChannelsForType';

const StyledContainer = styled(Container)({
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
});

export const Room = () => {
  const { roomId } = useParams<{ roomId: string }>();

  const {
    data: channelsPerType,
    refetch,
    isLoading,
  } = useGetChannelForType(Number(roomId));

  if (isLoading) {
    return <LinearProgress />;
  }

  return (
    <StyledContainer maxWidth="xl">
      <List disablePadding={true}>
        {channelsPerType.map(([channelType, channels], index) => {
          return channels.length ? (
            <ChannelsForType
              key={index}
              index={index}
              channelType={channelType}
              channels={channels}
              refetch={refetch}
            />
          ) : null;
        })}
      </List>
    </StyledContainer>
  );
};
