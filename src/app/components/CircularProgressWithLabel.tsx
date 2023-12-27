import { Box, CircularProgress, CircularProgressProps, Typography } from "@mui/material";

export const CircularProgressWithLabel = (
    props: CircularProgressProps & { value: number }
  ) => {
    return (
      <Box sx={{ position: 'relative', display: 'inline-flex' }}>
        <CircularProgress variant="determinate" {...props} size="45px" />
        <Box
          sx={{
            top: 0,
            left: 0,
            bottom: 0,
            right: 0,
            position: 'absolute',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Typography
            variant="caption"
          >{`${Math.round(props.value)}%`}</Typography>
        </Box>
      </Box>
    );
  };