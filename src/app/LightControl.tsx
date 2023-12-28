import { styled } from '@mui/system';
import { Box, CardHeader, Typography } from '@mui/material';
import {
  SwitchVirtualReceiverChannel,
  useSetValueMutation,
} from '../hooks/useApi';
import LightbulbOutlinedIconBase from '@mui/icons-material/LightbulbOutlined';
import LightbulbIconBase from '@mui/icons-material/Lightbulb';
import { IconButtonWithHover } from './components/IconButtonWithHover';
import { TypographyWithEllipsis } from './components/TypographyWithEllipsis';

interface ControlProps {
  channel: SwitchVirtualReceiverChannel;
  refetch: () => void;
}

const LightbulbIcon = styled(LightbulbIconBase)({
  cursor: 'pointer',
  color: 'orange',
  fontSize: '40px',
});

const LightbulbOutlinedIcon = styled(LightbulbOutlinedIconBase)({
  cursor: 'pointer',
  fontSize: '40px',
});

const StyledBox = styled(Box)({
  display: 'flex',
  flexDirection: 'column',
});

const TitleBox = styled(Box)({
  display: 'flex',
  alignItems: 'center',
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
  };

  return (
    <StyledBox>
      <CardHeader
        width="100%"
        title={
          <TitleBox>
            <IconButtonWithHover onClick={onHandleChange}>
              {checked ? <LightbulbIcon /> : <LightbulbOutlinedIcon />}
            </IconButtonWithHover>
            <TypographyWithEllipsis>{name}</TypographyWithEllipsis>
          </TitleBox>
        }
      />
    </StyledBox>
  );
};
