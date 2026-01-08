import styled from '@emotion/styled';
import { useNavigate } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { MdiMenu } from '../components/icons/MdiMenu';
import { TeenyiconsFloorplanSolid } from '../components/icons/TeenyiconsFloorplanSolid';
import { MdiPipeValve } from '../components/icons/MdiPipeValve';
import { useTheme } from '../contexts/ThemeContext';
import { useWebSocketContext } from '../hooks/useWebsocket';

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
  color: ${props => props.theme.colors.text};

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
  padding: 8px;
  border-radius: 4px;
  transition: background-color 0.2s ease;

  &:hover {
    background-color: ${props => props.theme.colors.hover};
  }
`;

const MenuSection = styled.div`
  border-bottom: 1px solid ${props => props.theme.colors.border};
  &:last-of-type {
    border-bottom: none;
  }
`;

const MenuSectionTitle = styled.div`
  padding: 16px 16px;
  font-size: 16px;
  font-weight: 600;
  color: ${props => props.theme.colors.text};
  background: ${props => props.theme.colors.surface};
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const SubMenuItem = styled.button`
  background: none;
  border: none;
  padding: 12px 16px 12px 40px;
  width: 100%;
  text-align: left;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 16px;
  color: ${props => props.theme.colors.textSecondary};
  transition: background-color 0.2s ease;

  &:hover {
    background-color: ${props => props.theme.colors.hover};
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
  const { getRooms, rooms, getTrades, trades, setChannels } = useWebSocketContext();

  useEffect(() => {
    if (menuOpen && (!rooms.length || !trades.length)) {
      getRooms();
      getTrades();
    }
  }, [menuOpen, rooms.length, trades.length, getRooms, getTrades]);

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
          <MenuSection>
            <MenuSectionTitle>Räume</MenuSectionTitle>
            {rooms.map((room) => (
              <SubMenuItem
                key={room.id}
                onClick={() => {
                  navigate({
                    to: '/room/$roomId',
                    params: { roomId: String(room.id) },
                  });
                  setMenuOpen(false);
                }}
              >
                <TeenyiconsFloorplanSolid />
                {room.name}
              </SubMenuItem>
            ))}
          </MenuSection>
          <MenuSection>
            <MenuSectionTitle>Gewerke</MenuSectionTitle>
            {trades.map((trade) => (
              <SubMenuItem
                key={trade.id}
                onClick={() => {
                  navigate({
                    to: '/trade/$tradeId',
                    params: { tradeId: trade.id.toString() },
                  });
                  setMenuOpen(false);
                }}
              >
                <MdiPipeValve />
                {trade.name}
              </SubMenuItem>
            ))}
          </MenuSection>
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
