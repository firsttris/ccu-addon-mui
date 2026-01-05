import styled from '@emotion/styled';

export const Button = styled.button`
  width: 50px;
  height: 50px;
  border-radius: 50%;
  border: 1px solid ${props => props.theme.colors.border};
  background: ${props => props.theme.colors.primary};
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${props => props.theme.colors.text};
  font-size: 25px;
  transition: all 0.2s ease;

  &:hover {
    background: ${props => props.theme.colors.hover};
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }
`;
