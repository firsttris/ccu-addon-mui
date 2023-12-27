import { styled } from '@mui/system';
import { Box, CardHeader, Typography } from '@mui/material';
import { SwitchVirtualReceiverChannel, useSetValueMutation } from '../hooks/useApi';
import LightbulbOutlinedIconBase from '@mui/icons-material/LightbulbOutlined';
import LightbulbIconBase from '@mui/icons-material/Lightbulb';

interface ControlProps {
  channel: SwitchVirtualReceiverChannel;
  refetch: () => void;
}

const LightbulbIcon = styled(LightbulbIconBase)({
  cursor: 'pointer',
  color: 'orange',
  fontSize: '40px',
  backgroundColor: 'lightgrey',
  borderRadius: '50%',
  padding: '10px',
  '&:hover': {
    backgroundColor: 'darkgrey',
  },
});

const LightbulbOutlinedIcon = styled(LightbulbOutlinedIconBase)({
  cursor: 'pointer',
  fontSize: '40px',
  backgroundColor: 'lightgrey',
  borderRadius: '50%',
  padding: '10px',
  '&:hover': {
    backgroundColor: 'darkgrey',
  },
});

const StyledBox = styled(Box)({
  display: 'flex',
  flexDirection: 'column',
});

const TitleBox = styled(Box)({
  display: 'flex',
  alignItems: 'center',
});

const StyledTypography = styled(Typography)({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  marginLeft: '10px',
});

export const LightControl = ({ channel, refetch }: ControlProps) => {
  const setValueMutation = useSetValueMutation();
  const { datapoints, name, address, interfaceName } = channel;
  const checked = datapoints.STATE === 'true';

  const onHandleChange = async () => {
    await setValueMutation.mutateAsync({
      interface: interfaceName,
      address,
      valueKey: 'STATE',
      type: 'boolean',
      value: !checked,
    });
    refetch();
  }

  return (
    <StyledBox>
      <CardHeader
        title={
          <TitleBox>
            {checked ? (
              <LightbulbIcon onClick={onHandleChange} />
            ) : (
              <LightbulbOutlinedIcon onClick={onHandleChange} />
            )}
            <StyledTypography>
              {name}
            </StyledTypography>
          </TitleBox>
        }
      />
    </StyledBox>
  );
};