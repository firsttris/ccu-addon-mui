import {
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';
import { useChannelForRoom } from '../hooks/useApi';
import InboxIcon from '@mui/icons-material/Inbox';

export const Room = () => {
  const navigate = useNavigate();

  const { roomId } = useParams();

  const result = useChannelForRoom(roomId);

  if (result.isFetched && result.channelsForRoom) {
    return (
      <List>
        {result.channelsForRoom.map((channel) => (
          <ListItem disablePadding key={channel.id}>
            <ListItemButton>
              <ListItemIcon>
                <InboxIcon />
              </ListItemIcon>
              <ListItemText primary={channel.name} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    );
  } else {
    return null;
  }
};
