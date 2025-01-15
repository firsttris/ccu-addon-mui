import styled from '@emotion/styled';
import { HeaderIcon } from './StyledIcons';
import { TypographyWithEllipsis } from './TypographyWithEllipsis';

interface ChannelHeaderProps {
  name: string;
  icon: string;
  color?: string;
  onClick?: () => void;
}

const HeaderContainer = styled.div`
  display: flex;
  align-items: center;
  width: 100%;
`;

const CardHeader = styled.div<{ onClick?: () => void }>`
  cursor: ${({ onClick }) => (onClick ? 'pointer' : 'default')};
  width: 100%;
  padding: 10px;
  box-sizing: border-box;
`;

export const ChannelHeader = ({
  name,
  icon,
  color,
  onClick,
  ...props
}: ChannelHeaderProps) => {
  return (
    <CardHeader onClick={onClick} {...props}>
      <HeaderContainer>
        <HeaderIcon icon={icon} color={color} />
        <TypographyWithEllipsis>{name}</TypographyWithEllipsis>
      </HeaderContainer>
    </CardHeader>
  );
};