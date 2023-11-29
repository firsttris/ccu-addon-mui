import { ListItemText, Switch } from '@mui/material';
import { SwitchVirtualReceiverChannel, useSetValueMutation } from '../hooks/useApi';
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
  const { datapoints, name, address, interfaceName } = channel;
  const checked = datapoints.STATE === 'true';

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
      />
    </>
  );
};
