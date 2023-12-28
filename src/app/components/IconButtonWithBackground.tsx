import { IconButton, IconButtonProps } from '@mui/material';

export const IconButtonWithBackground: React.FC<IconButtonProps> = (props) => (
  <IconButton
    sx={{
      borderRadius: '10px',
      padding: '1px',
    }}
    {...props}
  />
);
