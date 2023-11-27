import { ListItemText, Switch } from '@mui/material';
import { SwitchVirtualReceiverChannel, SwitchVirtualReceiverDatapoint, interfaceName, useGetValue, useSetValueMutation } from '../hooks/useApi';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import LightbulbIcon from '@mui/icons-material/Lightbulb';

interface ControlProps {
  channel: SwitchVirtualReceiverChannel;
  refetch: () => void;
}
export const LightControl = ({
  channel,
  refetch,
}: ControlProps) => {

  const setValueMutation = useSetValueMutation();
  const checked = channel.datapoints.STATE === 'true';
  const name = channel.name;
  const address = channel.address;

  return (
    <>
      {checked ? (
        <LightbulbIcon sx={{ color: 'orange' }} />
      ) : (
        <LightbulbOutlinedIcon />
      )}
      <ListItemText
        primary={name}
        sx={{
          marginLeft: '10px',
          '& .MuiListItemText-primary': {
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
          },
        }}
      />
      <Switch
        edge="end"
        onChange={async () => {
          await setValueMutation.mutateAsync({
            interface: interfaceName,
            address,
            valueKey: 'STATE',
            type: 'boolean',
            value: !checked,
          });
          refetch();
        }}
        checked={checked}
        inputProps={{
          'aria-labelledby': 'switch-list-label-wifi',
        }}
      />
    </>
  );
};
