import styled from '@emotion/styled';
import { useNavigate } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import MdiMenu from '~icons/mui/menu';
import TeenyiconsFloorplanSolid from '~icons/teenyicons/floorplan-solid';
import MdiPipeValve from '~icons/mdi/pipe-valve';
import { useTheme } from '../contexts/ThemeContext';
import { useWebSocketContext } from '../hooks/useWebsocket';
import { useTranslations } from '../i18n/utils';
import { useDeviceProblems, useRooms, useTrades } from '../queries';

// A short reconnect (e.g. at startup) should not flash a warning
const CONNECTION_WARNING_DELAY_MS = 2000;

const ProblemBadge = styled.button`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border: none;
  border-radius: 14px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  background: #e65100;
`;

const ConnectionBanner = styled.div`
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  padding: 6px 16px;
  font-size: 14px;
  font-weight: 600;
  text-align: center;
  color: #fff;
  background: #c62828;
`;

const ConnectionDot = styled('span', {
  shouldForwardProp: (prop) => prop !== 'connected',
})<{ connected: boolean }>`
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: ${({ connected }) => (connected ? '#43a047' : '#c62828')};
`;

const RightGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
`;

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
  /* Long names must not stick out of the hidden menu; many rooms scroll */
  overflow-x: hidden;
  overflow-y: auto;
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
  const t = useTranslations();
  const {
    connectionStatus,
    authRequired,
    logout,
    userLevel,
  } = useWebSocketContext();
  const { data: deviceProblems } = useDeviceProblems();

  const problemCount = deviceProblems?.length ?? 0;

  const connected = connectionStatus === 'Open';
  const [showConnectionWarning, setShowConnectionWarning] = useState(false);
  useEffect(() => {
    if (connected) {
      setShowConnectionWarning(false);
      return;
    }
    const timer = setTimeout(() => setShowConnectionWarning(true), CONNECTION_WARNING_DELAY_MS);
    return () => clearTimeout(timer);
  }, [connected]);

  // Loaded when the menu is first opened, then kept in the query cache
  const { data: rooms = [] } = useRooms({ enabled: menuOpen });
  const { data: trades = [] } = useTrades({ enabled: menuOpen });

  return (
    <HeaderContainer>
      <div style={{ position: 'relative' }}>
        <Menu
          // Closed, it is only moved out of view: keep it out of reach of
          // keyboard and screen readers
          inert={!menuOpen}
          style={{
            transform: menuOpen ? 'translateX(0)' : 'translateX(-100%)',
          }}
        >
          <MenuHeader>
            {t('NAVIGATION')}
            <CloseButton onClick={() => setMenuOpen(false)}>×</CloseButton>
          </MenuHeader>
          <MenuSection>
            <MenuSectionTitle>{t('ROOMS')}</MenuSectionTitle>
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
            <MenuSectionTitle>{t('TRADES')}</MenuSectionTitle>
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
          <MenuSection>
            <SubMenuItem
              onClick={() => {
                navigate({ to: '/devices' });
                setMenuOpen(false);
              }}
            >
              {t('ALL_DEVICES')}
            </SubMenuItem>
            <SubMenuItem
              onClick={() => {
                navigate({ to: '/sysvars' });
                setMenuOpen(false);
              }}
            >
              {t('SYSVARS')}
            </SubMenuItem>
            <SubMenuItem
              onClick={() => {
                navigate({ to: '/programs' });
                setMenuOpen(false);
              }}
            >
              {t('PROGRAMS')}
            </SubMenuItem>
            {userLevel === 'admin' && (
              <SubMenuItem
                onClick={() => {
                  navigate({ to: '/setup' });
                  setMenuOpen(false);
                }}
              >
                {t('SETUP')}
              </SubMenuItem>
            )}
          </MenuSection>
          {authRequired && (
            <MenuSection>
              <SubMenuItem
                onClick={() => {
                  setMenuOpen(false);
                  logout();
                }}
              >
                {t('LOGOUT')}
              </SubMenuItem>
            </MenuSection>
          )}
        </Menu>
        <IconButton onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">
          <MdiMenu />
        </IconButton>
      </div>
      <RightGroup>
        {problemCount > 0 && (
          <ProblemBadge
            onClick={() => navigate({ to: '/' })}
            aria-label={`${t('DEVICE_PROBLEMS')}: ${problemCount}`}
            title={t('DEVICE_PROBLEMS')}
          >
            ⚠️ {problemCount}
          </ProblemBadge>
        )}
        <ConnectionDot
          connected={connected}
          role="img"
          aria-label={connected ? t('CONNECTED') : t('CONNECTING')}
          title={connected ? t('CONNECTED') : t('CONNECTING')}
        />
        <IconButton onClick={toggleTheme} aria-label="Toggle Theme">
          {theme.mode === 'light' ? '🌙' : '☀️'}
        </IconButton>
      </RightGroup>
      {showConnectionWarning && (
        <ConnectionBanner role="status">{t('CONNECTION_LOST')}</ConnectionBanner>
      )}
    </HeaderContainer>
  );
};
