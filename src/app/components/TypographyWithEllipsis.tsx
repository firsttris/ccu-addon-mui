import { Typography, styled } from "@mui/material";

export const TypographyWithEllipsis = styled(Typography)({
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    marginLeft: '5px',
    whiteSpace: 'nowrap',
  });