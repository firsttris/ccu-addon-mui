import { ListItemText, Switch } from '@mui/material';
import { useSetValueMutation } from '../hooks/useApi';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import LightbulbIcon from '@mui/icons-material/Lightbulb';

interface ControlProps {
  interfaceName: string;
  address: string;
  name: string;
  checked: boolean;
}
export const LightControl = ({
  name,
  address,
  interfaceName,
  checked
}: ControlProps) => {

  const setValueMutation = useSetValueMutation();

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
          // refetch api await getChannelValueQueryInfo.refetch();
        }}
        checked={checked}
        inputProps={{
          'aria-labelledby': 'switch-list-label-wifi',
        }}
      />
    </>
  );
};
