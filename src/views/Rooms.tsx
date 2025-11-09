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

export const Rooms = () => {
  const navigate = useNavigate();
  const { getRooms, rooms, setChannels } = useWebSocketContext();

  useEffect(() => {
    getRooms();
  }, []);

  if (rooms) {
    return (
      <Container>
        <List>
          {rooms.map((room, index) => (
            <ListItem
              key={index}
              onClick={() => {
                setChannels([]);
                navigate({
                  to: '/room/$roomId',
                  params: { roomId: String(room.id) },
                });
              }}
            >
              <TeenyiconsFloorplanSolid width={35} />
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
