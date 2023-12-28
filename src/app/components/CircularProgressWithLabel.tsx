import { Box, CircularProgress, CircularProgressProps, Typography } from "@mui/material";
import { styled } from "@mui/system";

const StyledBox = styled(Box)({
  position: 'relative',
  display: 'inline-flex',
});

const InnerBox = styled(Box)({
  top: 0,
  left: 0,
  bottom: 0,
  right: 0,
  position: 'absolute',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});

const StyledCircularProgress = styled(CircularProgress)(({ theme }) => ({
  color: theme.palette.primary.main, // Farbe für den erreichten Teil
  position: 'absolute',
  size: '45px',
}));

const BackgroundCircularProgress = styled(CircularProgress)({
  color: 'lightgrey', // Farbe für den nicht erreichten Teil
  size: '45px',
});

export const CircularProgressWithLabel = (
    props: CircularProgressProps & { value: number }
  ) => {
    const { sx, ...other} = props;
    return (
      <StyledBox>
        <BackgroundCircularProgress variant="determinate" value={100} />
        <StyledCircularProgress variant="determinate" {...other} />
        <InnerBox>
          <Typography
            variant="caption"
          >{`${Math.round(props.value)}%`}</Typography>
        </InnerBox>
      </StyledBox>
    );
  };