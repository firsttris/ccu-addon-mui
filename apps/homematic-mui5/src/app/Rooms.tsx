import {
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import { useApi } from '../hooks/useApi';
import InboxIcon from '@mui/icons-material/Inbox';
import { useNavigate } from 'react-router-dom';

export const Rooms = () => {
  const navigate = useNavigate();

  const response = useApi('Room.getAll');
  console.log('response', response);
  const rooms = response.data?.data.result;

  if (response.isFetched) {
    return (
      <List>
        {rooms.map((room: { name: string; id: string; channelIds: string[] }) => (
          <ListItem
            disablePadding
            key={room.id}
            onClick={() => navigate(`/room/${room.id}/${room.channelIds.join(',')}`)}
          >
            <ListItemButton>
              <ListItemIcon>
                <InboxIcon />
              </ListItemIcon>
              <ListItemText primary={room.name} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    );
  } else {
    return null
  }
};
