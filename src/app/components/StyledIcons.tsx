import { Icon } from "@iconify/react";
import { styled } from "@mui/material";

interface StyledIconButtonProps {
  icon: string;
  active?: string;
}

export const StyledIconButton = styled(Icon)<StyledIconButtonProps>`
  color: ${(props) => (props.active === 'true' ? '#0077B6' : '#000')};
  font-size: 40px;
  background-color: lightGrey;
  border-radius: 10px;
  padding: 1px;
  cursor: pointer;
`;

export const StyledHeaderIcon = styled(Icon)`
  font-size: 30px;
`;