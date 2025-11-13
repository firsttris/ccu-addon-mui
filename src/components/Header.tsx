import styled from '@emotion/styled';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { MdiMenu } from '../components/icons/MdiMenu';
import { TeenyiconsFloorplanSolid } from '../components/icons/TeenyiconsFloorplanSolid';
import { MdiPipeValve } from '../components/icons/MdiPipeValve';

const HeaderContainer = styled.div`
  position: fixed;
  display: flex;
  justify-content: flex-start;
  align-items: center;
  width: auto;
  top: 0;
  left: 0;
  z-index: 1000;
  background-color: white;
  padding: 10px;
`;

const IconButton = styled.button`
  background: #fff;
  border: 2px solid #ddd;
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
    background: #f0f0f0;
    border-color: #bbb;
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
  background: #f9f9f9;
  border: 1px solid #ddd;
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
  color: #333;
  border-bottom: 1px solid #ddd;
  background: #fff;
  border-radius: 0 8px 0 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  font-size: 24px;
  color: #666;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: background-color 0.2s ease;

  &:hover {
    background-color: #eee;
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
  color: #555;
  transition: background-color 0.2s ease;
  border-bottom: 1px solid #eee;

  &:hover {
    background-color: #e0e0e0;
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
    </HeaderContainer>
  );
};
