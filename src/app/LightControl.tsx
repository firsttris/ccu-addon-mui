import { Box, CardContent, CardHeader, ListItemText, Switch, styled } from '@mui/material';
import {
  SwitchVirtualReceiverChannel,
  useSetValueMutation,
} from '../hooks/useApi';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import LightbulbIcon from '@mui/icons-material/Lightbulb';

const BiggerSwitch = styled(Switch)({
  transform: 'scale(1.5)', // Adjust scale to desired size
});

interface ControlProps {
  channel: SwitchVirtualReceiverChannel;
  refetch: () => void;
}
export const LightControl = ({ channel, refetch }: ControlProps) => {
  const setValueMutation = useSetValueMutation();
  const { datapoints, name, address, interfaceName } = channel;
  const checked = datapoints.STATE === 'true';

  return (
    <Box
      sx={{ display: 'flex', flexDirection: 'column' }}
    >
      <CardHeader
        title={
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            {checked ? (
              <LightbulbIcon
                sx={{ color: 'orange', fontSize: '40px', ml: '5px' }}
              />
            ) : (
              <LightbulbOutlinedIcon sx={{ fontSize: '40px', ml: '5px' }} />
            )}
            <ListItemText
              primary={name}
              sx={{
                marginLeft: '10px',
                minWidth: '200px',
                '& .MuiListItemText-primary': {
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                },
              }}
            />
          </Box>
        }
      />

      <CardContent
      >
        <BiggerSwitch
          edge="end"
          size="medium"
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
      </CardContent>
    </Box>
  );
};
