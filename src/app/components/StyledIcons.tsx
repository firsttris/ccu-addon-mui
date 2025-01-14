import styled from "@emotion/styled";
import { Icon } from "@iconify/react";

interface IconButtonProps {
  icon: string;
  active?: boolean;
}

export const IconButton = styled(Icon, { shouldForwardProp: (prop) => prop !== 'active', })<IconButtonProps>`
  color: ${(props) => (props.active ? '#0077B6' : '#000')};
  font-size: 40px;
  background-color: lightGrey;
  border-radius: 10px;
  padding: 1px;
  cursor: pointer;
`;

export const HeaderIcon = styled(Icon)`
  font-size: 30px;
`;