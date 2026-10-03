import { useNavigate } from '@tanstack/react-router';
import { ButtonHTMLAttributes, HTMLAttributes, useState, useEffect } from 'react';
import MdiMenu from '~icons/mui/menu';
import TeenyiconsFloorplanSolid from '~icons/teenyicons/floorplan-solid';
import MdiPipeValve from '~icons/mdi/pipe-valve';
import { useTheme } from '../contexts/ThemeContext';
import { useWebSocketContext } from '../hooks/useWebsocket';
import { useDeviceProblems, useRooms, useTrades } from '../queries';
import { m } from '../paraglide/messages';

// A short reconnect (e.g. at startup) should not flash a warning
const CONNECTION_WARNING_DELAY_MS = 2000;

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;
type DivProps = HTMLAttributes<HTMLDivElement>;

const ProblemBadge = (props: ButtonProps) => (
  <button
    className="flex items-center gap-1 px-[10px] py-[6px] border-none rounded-[14px] cursor-pointer text-[14px] font-semibold text-white bg-[#e65100]"
    {...props}
  />
);

const ConnectionBanner = (props: DivProps) => (
  <div
    className="absolute top-full left-0 right-0 px-4 py-[6px] text-[14px] font-semibold text-center text-white bg-[#c62828]"
    {...props}
  />
);

const ConnectionDot = ({ connected, ...props }: HTMLAttributes<HTMLSpanElement> & { connected: boolean }) => (
  <span className={`w-[10px] h-[10px] rounded-full ${connected ? 'bg-[#43a047]' : 'bg-[#c62828]'}`} {...props} />
);

const IconButton = (props: ButtonProps) => (
  <button
    className="bg-primary border-2 border-solid border-border p-[10px] cursor-pointer flex items-center justify-center text-[20px] rounded-lg shadow-[0_2px_4px_rgba(0,0,0,0.1)] transition-all duration-200 ease-[ease] text-text hover:bg-hover hover:border-border hover:scale-105 active:scale-95"
    {...props}
  />
);

// Moved out of view with an inline transform when closed
const Menu = (props: DivProps & { inert?: boolean }) => (
  <div
    className="fixed top-0 left-0 bg-surface border border-solid border-border border-l-0 rounded-[0_8px_8px_0] shadow-[2px_0_8px_rgba(0,0,0,0.1)] z-[999] w-[220px] h-screen transition-transform duration-300 ease-[ease] flex flex-col overflow-x-hidden overflow-y-auto"
    {...props}
  />
);

const MenuHeader = (props: DivProps) => (
  <div
    className="py-[10px] px-4 text-[18px] font-semibold text-text border-b border-border bg-primary rounded-[0_8px_0_0] flex justify-between items-center"
    {...props}
  />
);

const CloseButton = (props: ButtonProps) => (
  <button
    className="bg-transparent border-none text-[24px] text-text-secondary cursor-pointer p-2 rounded transition-[background-color] duration-200 ease-[ease] hover:bg-hover"
    {...props}
  />
);

const MenuSection = (props: DivProps) => (
  <div className="border-b border-border last-of-type:border-b-0" {...props} />
);

const MenuSectionTitle = (props: DivProps) => (
  <div className="p-4 text-[16px] font-semibold text-text bg-surface uppercase tracking-[0.5px]" {...props} />
);

const SubMenuItem = (props: ButtonProps) => (
  <button
    className="bg-transparent border-none pt-3 pr-4 pb-3 pl-10 w-full text-left cursor-pointer flex items-center gap-3 text-[16px] text-text-secondary transition-[background-color] duration-200 ease-[ease] hover:bg-hover [&_svg]:w-5 [&_svg]:h-5 [&_svg]:shrink-0"
    {...props}
  />
);

export const Header: React.FC = () => {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
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
    <div className="fixed flex justify-between items-center w-full top-0 left-0 z-[1000] bg-primary py-[10px] px-5 box-border">
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
            {m.NAVIGATION()}
            <CloseButton onClick={() => setMenuOpen(false)}>×</CloseButton>
          </MenuHeader>
          <MenuSection>
            <MenuSectionTitle>{m.ROOMS()}</MenuSectionTitle>
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
            <MenuSectionTitle>{m.TRADES()}</MenuSectionTitle>
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
              {m.ALL_DEVICES()}
            </SubMenuItem>
            <SubMenuItem
              onClick={() => {
                navigate({ to: '/sysvars' });
                setMenuOpen(false);
              }}
            >
              {m.SYSVARS()}
            </SubMenuItem>
            <SubMenuItem
              onClick={() => {
                navigate({ to: '/programs' });
                setMenuOpen(false);
              }}
            >
              {m.PROGRAMS()}
            </SubMenuItem>
            {userLevel === 'admin' && (
              <SubMenuItem
                onClick={() => {
                  navigate({ to: '/setup' });
                  setMenuOpen(false);
                }}
              >
                {m.SETUP()}
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
                {m.LOGOUT()}
              </SubMenuItem>
            </MenuSection>
          )}
        </Menu>
        <IconButton onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">
          <MdiMenu />
        </IconButton>
      </div>
      <div className="flex items-center gap-[14px]">
        {problemCount > 0 && (
          <ProblemBadge
            onClick={() => navigate({ to: '/' })}
            aria-label={`${m.DEVICE_PROBLEMS()}: ${problemCount}`}
            title={m.DEVICE_PROBLEMS()}
          >
            ⚠️ {problemCount}
          </ProblemBadge>
        )}
        <ConnectionDot
          connected={connected}
          role="img"
          aria-label={connected ? m.CONNECTED() : m.CONNECTING()}
          title={connected ? m.CONNECTED() : m.CONNECTING()}
        />
        <IconButton onClick={toggleTheme} aria-label="Toggle Theme">
          {theme.mode === 'light' ? '🌙' : '☀️'}
        </IconButton>
      </div>
      {showConnectionWarning && (
        <ConnectionBanner role="status">{m.CONNECTION_LOST()}</ConnectionBanner>
      )}
    </div>
  );
};
