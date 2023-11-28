import {
  Container,
  Divider,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
} from '@mui/material';
import { removeSessionId, useGetRegaRooms } from '../hooks/useApi';
import MeetingRoomOutlinedIcon from '@mui/icons-material/MeetingRoomOutlined';
import { useNavigate } from 'react-router-dom';
import { Box } from '@mui/system';

export const Rooms = () => {
  const navigate = useNavigate();

  const { data: rooms, isFetched, error, isError} = useGetRegaRooms();


  if(isError && (error as Error)?.message.includes('access denied')) {
    removeSessionId();
    navigate('/');
  } 

  if (isFetched && rooms) {
    return (
      <Container maxWidth="md">
        <List>
          {rooms.map((room, index) => (
            <Box key={index}>
              <ListItem
                disablePadding
                key={room.id}
                onClick={() =>
                  navigate(
                    `/room/${room.id}`
                  )
                }
              >
                <ListItemButton>
                  <MeetingRoomOutlinedIcon />

                  <ListItemText
                    primary={room.name}
                    sx={{ marginLeft: '20px' }}
                  />
                </ListItemButton>
              </ListItem>
              {rooms.length === index + 1 ? null : <Divider />}
            </Box>
          ))}
        </List>
      </Container>
    );
  } else {
    return null;
  }
};
