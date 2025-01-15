import { useNavigate } from 'react-router-dom';
import styled from '@emotion/styled';
import { Typography, ListItem } from './ChannelsForType';
import { Icon } from '@iconify/react';
import { useWebSocketContext } from './../hooks/useWebsocket';
import { useEffect } from 'react';

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

const ListItemText = styled(Typography)`
  margin-left: 20px;
`;

export const Rooms = () => {
  const navigate = useNavigate();
  const {getRooms, rooms, setChannels } = useWebSocketContext();

  useEffect(() => {
      getRooms();
  }, []);

  if (rooms) {
    return (
      <Container>
        <List>
          {rooms.map((room, index) => (
            <ListItem key={index} onClick={() => {
              setChannels([])
              navigate(`/room/${room.id}`)
            }}>
              <Icon icon="mdi:door-open" fontSize={"35px"} />
              <ListItemText>{room.name}</ListItemText>
            </ListItem>
          ))}
        </List>
      </Container>
    );
  } else {
    return null;
  }
};