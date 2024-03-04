import { Icon } from "@iconify/react";
import { styled } from "@mui/material";

interface StyledIconButtonProps {
  icon: string;
  active?: boolean;
}

export const StyledIconButton = styled(Icon, { shouldForwardProp: (prop) => prop !== 'active', })<StyledIconButtonProps>`
  color: ${(props) => (props.active ? '#0077B6' : '#000')};
  font-size: 40px;
  background-color: lightGrey;
  border-radius: 10px;
  padding: 1px;
  cursor: pointer;
`;

export const StyledHeaderIcon = styled(Icon)`
  font-size: 30px;
`;