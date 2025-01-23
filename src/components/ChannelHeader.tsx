import styled from '@emotion/styled';
import { ReactNode } from 'react';

interface ChannelHeaderProps {
  name: string;
  icon: ReactNode;
}

const HeaderContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 2.5px;
  justify-content: center;
  //width: 100%;
`;

const CardHeader = styled.div`

  width: 100%;
  display: flex;
  //justify-content: center;
  margin-bottom: 5px;
  margin-top: -5px;
  
  //margin: 5px;
  //margin-top: 5px;
  //box-sizing: border-box;
`;

const Name = styled.div`
  white-space: normal;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2; /* Number of lines to show before truncating */
  -webkit-box-orient: vertical;
  width: 180px;
  font-weight: bold;
`;

export const ChannelHeader = ({
  name,
  icon,
  ...props
}: ChannelHeaderProps) => {
  return (
    <CardHeader  {...props}>
      <HeaderContainer>
        {icon}
        <Name>{name}</Name>
      </HeaderContainer>
    </CardHeader>
  );
};
