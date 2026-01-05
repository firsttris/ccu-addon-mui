import styled from '@emotion/styled';

export const Name = styled.div`
  white-space: nowrap; /* Ensure text does not wrap to the next line */
  overflow: hidden; /* Hide overflow text */
  text-overflow: ellipsis; /* Show ellipsis (...) for overflow text */
  font-size: 13px;
  margin-bottom: 5px;
`;

const IconWrapper = styled.div`
  display: flex;
  align-items: center;
  margin-right: 6px;
  margin-bottom: 4px;
  color: ${props => props.theme.colors.textSecondary};
  flex-shrink: 0;
  
  svg {
    width: 18px;
    height: 18px;
  }
`;

export const ChannelName = ({
  name,
  maxWidth,
  icon,
}: {
  name: string;
  maxWidth: string;
  icon?: React.ReactNode;
}) => {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: '5px',
        maxWidth,
      }}
    >
      {icon && <IconWrapper>{icon}</IconWrapper>}
      <Name>{name}</Name>
    </div>
  );
};
