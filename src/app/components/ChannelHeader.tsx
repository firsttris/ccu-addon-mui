import { Box, CardHeader } from '@mui/material';
import { StyledHeaderIcon } from './StyledIcons';
import { TypographyWithEllipsis } from './TypographyWithEllipsis';

interface ChannelHeaderProps {
  name: string;
  icon: string;
  color?: string;
  onClick?: () => void;
}

export const ChannelHeader = ({
  name,
  icon,
  color,
  onClick,
  ...props
}: ChannelHeaderProps) => {
  return (
    <CardHeader
      onClick={onClick}
      title={
        <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
          <StyledHeaderIcon icon={icon} color={color} />
          <TypographyWithEllipsis>{name}</TypographyWithEllipsis>
        </Box>
      }
      {...props}
    />
  );
};
