import styled from '@emotion/styled';

export const Button = styled.button`
  width: 50px;
  height: 50px;
  border-radius: 50%;
  border: 1px solid #ccc;
  background: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 25px;
  transition: all 0.2s ease;

  &:hover {
    background: #f0f0f0;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }
`;
