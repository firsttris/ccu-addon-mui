import { IconButton, IconButtonProps } from '@mui/material';

export const IconButtonWithHover: React.FC<IconButtonProps> = (props) => (
  <IconButton
    sx={{
      backgroundColor: 'lightgrey',
      borderRadius: '10px',
      padding: '1px',
      '&:hover': {
        backgroundColor: 'grey',
      },
    }}
    {...props}
  />
);
