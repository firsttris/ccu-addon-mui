import styled from '@emotion/styled';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { MdiMenu } from '../components/icons/MdiMenu';
import { TeenyiconsFloorplanSolid } from '../components/icons/TeenyiconsFloorplanSolid';
import { MdiPipeValve } from '../components/icons/MdiPipeValve';
import { useTheme } from '../contexts/ThemeContext';

const HeaderContainer = styled.div`
  position: fixed;
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  top: 0;
  left: 0;
  z-index: 1000;
  background-color: ${props => props.theme.colors.primary};
  padding: 10px 20px;
  box-sizing: border-box;
`;

const IconButton = styled.button`
  background: ${props => props.theme.colors.primary};
  border: 2px solid ${props => props.theme.colors.border};
  padding: 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  transition: all 0.2s ease;

  &:hover {
    background: ${props => props.theme.colors.hover};
    border-color: ${props => props.theme.colors.border};
    transform: scale(1.05);
  }

  &:active {
    transform: scale(0.95);
  }
`;

const Menu = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  background: ${props => props.theme.colors.surface};
  border: 1px solid ${props => props.theme.colors.border};
  border-left: none;
  border-radius: 0 8px 8px 0;
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.1);
  z-index: 999;
  width: 220px;
  height: 100vh;
  transform: translateX(-100%);
  transition: transform 0.3s ease;
  display: flex;
  flex-direction: column;
`;

const MenuHeader = styled.div`
  padding: 10px 16px;
  font-size: 18px;
  font-weight: 600;
  color: ${props => props.theme.colors.text};
  border-bottom: 1px solid ${props => props.theme.colors.border};
  background: ${props => props.theme.colors.primary};
  border-radius: 0 8px 0 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  font-size: 24px;
  color: ${props => props.theme.colors.textSecondary};
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: background-color 0.2s ease;

  &:hover {
    background-color: ${props => props.theme.colors.hover};
  }
`;

const MenuItem = styled.button`
  background: none;
  border: none;
  padding: 12px 16px;
  width: 100%;
  text-align: left;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 16px;
  color: ${props => props.theme.colors.textSecondary};
  transition: background-color 0.2s ease;
  border-bottom: 1px solid ${props => props.theme.colors.border};

  &:hover {
    background-color: ${props => props.theme.colors.hover};
  }

  &:last-of-type {
    border-bottom: none;
    border-radius: 0 0 8px 0;
  }

  svg {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
  }
`;

export const Header: React.FC = () => {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <HeaderContainer>
      <div style={{ position: 'relative' }}>
        <Menu
          style={{
            transform: menuOpen ? 'translateX(0)' : 'translateX(-100%)',
          }}
        >
          <MenuHeader>
            Navigation
            <CloseButton onClick={() => setMenuOpen(false)}>×</CloseButton>
          </MenuHeader>
          <MenuItem
            onClick={() => {
              navigate({ to: '/rooms' });
              setMenuOpen(false);
            }}
          >
            <TeenyiconsFloorplanSolid />
            Räume
          </MenuItem>
          <MenuItem
            onClick={() => {
              navigate({ to: '/trades' });
              setMenuOpen(false);
            }}
          >
            <MdiPipeValve />
            Gewerke
          </MenuItem>
        </Menu>
        <IconButton onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">
          <MdiMenu />
        </IconButton>
      </div>
      <IconButton onClick={toggleTheme} aria-label="Toggle Theme">
        {theme.mode === 'light' ? '🌙' : '☀️'}
      </IconButton>
    </HeaderContainer>
  );
};
