import { ListItemText, Switch } from '@mui/material';
import { useGetValue, useSetValueMutation } from '../hooks/useApi';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import LightbulbIcon from '@mui/icons-material/Lightbulb';

interface ControlProps {
  interfaceName: string;
  address: string;
  name: string;
}
export const LightControl = ({
  name,
  address,
  interfaceName,
}: ControlProps) => {
  const getChannelValueQueryInfo = useGetValue(interfaceName, address, 'STATE');

  const setValueMutation = useSetValueMutation();

  const checked = getChannelValueQueryInfo.data?.data.result === '1';

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
          await getChannelValueQueryInfo.refetch();
        }}
        checked={checked}
        inputProps={{
          'aria-labelledby': 'switch-list-label-wifi',
        }}
      />
    </>
  );
};
