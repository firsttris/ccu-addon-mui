import {
  Box,
  CircularProgress,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Switch,
} from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';
import { ChannelType, useChannelForRoom, useGetValue, useSetValueMutation } from '../hooks/useApi';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import BlindsOutlinedIcon from '@mui/icons-material/BlindsOutlined';
import ThermostatOutlinedIcon from '@mui/icons-material/ThermostatOutlined';

interface LightControlProps {
    address: string
    valueKey: string
}
export const LightControl = ({ address, valueKey }: LightControlProps) => {

    const getChannelValueQueryInfo = useGetValue(address, valueKey)

    const setValueMutation = useSetValueMutation()

    const checked = getChannelValueQueryInfo.data?.data.result === "1"

    return <Switch
    edge="end"
    onChange={async () => {
        await setValueMutation.mutateAsync({ address, valueKey, type: 'boolean', value: !checked})
        await getChannelValueQueryInfo.refetch()
    }}
    checked={checked}
    inputProps={{
      'aria-labelledby': 'switch-list-label-wifi',
    }}
  />
}
export const Room = () => {

  const { roomId } = useParams();

  const result = useChannelForRoom(roomId);

  console.log(result.channelsForRoom);

  if (result.isFetched && result.channelsForRoom) {
    return (
      <List>
        {result.channelsForRoom.map((channel) => (
          <ListItem disablePadding key={channel.id}>
            <ListItemButton>
              <ListItemIcon>
                {channel.channelType === ChannelType.SWITCH_VIRTUAL_RECEIVER ? (
                  <LightbulbOutlinedIcon />
                ) : null}
                {channel.channelType === ChannelType.BLIND_VIRTUAL_RECEIVER ? (
                  <BlindsOutlinedIcon />
                ) : null}
                {channel.channelType ===
                ChannelType.HEATING_CLIMATECONTROL_TRANSCEIVER ? (
                  <ThermostatOutlinedIcon />
                ) : null}
              </ListItemIcon>
              <ListItemText primary={channel.name} />
            </ListItemButton>
            {channel.channelType === ChannelType.SWITCH_VIRTUAL_RECEIVER ? (
                  <LightControl address={channel.address} valueKey={"STATE"} />
                ) : null}
          </ListItem>
        ))}
      </List>
    );
  } else if (result.isLoading) {
    return (
      <Box
        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <CircularProgress />
      </Box>
    );
  } else {
    return null;
  }
};
