import styled from '@emotion/styled';
import { Icon } from '@iconify/react';

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
  padding-top: 5px;
  box-sizing: border-box;
`;

const Name = styled.div`
  white-space: normal;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2; /* Number of lines to show before truncating */
  -webkit-box-orient: vertical;
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
        <Icon style={{ fontSize: '30px' }} icon={icon} color={color} />
        <Name style={{ marginLeft: '5px' }}>{name}</Name>
      </HeaderContainer>
    </CardHeader>
  );
};
