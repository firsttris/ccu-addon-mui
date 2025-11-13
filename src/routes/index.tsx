import { createFileRoute, Link } from '@tanstack/react-router';
import styled from '@emotion/styled';

const Container = styled.div`
  max-width: 1280px;
  margin: 0 auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

const Title = styled.h1`
  text-align: center;
  margin-bottom: 40px;
`;

const MenuItem = styled(Link)`
  display: flex;
  align-items: center;
  padding: 16px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  text-decoration: none;
  color: #000;
  background: #f9f9f9;
  transition: background 0.2s;

  &:hover {
    background: #f0f0f0;
  }
`;

const MenuText = styled.span`
  font-size: 20px;
  font-weight: 600;
  margin-left: 16px;
`;

export const Route = createFileRoute('/')({
  component: () => (
    <Container>
      <Title>CCU Addon MUI</Title>
      <MenuItem to="/rooms">
        <span role="img" aria-label="Rooms">
          🏠
        </span>
        <MenuText>Räume</MenuText>
      </MenuItem>
      <MenuItem to="/trades">
        <span role="img" aria-label="Trades">
          🔧
        </span>
        <MenuText>Gewerke</MenuText>
      </MenuItem>
    </Container>
  ),
});
