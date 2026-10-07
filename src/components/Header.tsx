import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import MenuIcon from '~icons/lucide/menu';
import TriangleAlertIcon from '~icons/lucide/triangle-alert';
import HomeIcon from '~icons/lucide/house';
import TagIcon from '~icons/lucide/tag';
import { getStartPage, setStartPage, StartPage } from '../lib/startPage';
import { PushSettings } from './PushSettings';
import StarIcon from '~icons/lucide/star';
import ListIcon from '~icons/lucide/list';
import BracesIcon from '~icons/lucide/braces';
import ChartIcon from '~icons/lucide/chart-line';
import HeartPulseIcon from '~icons/lucide/heart-pulse';
import PlayIcon from '~icons/lucide/play';
import SlidersIcon from '~icons/lucide/sliders-horizontal';
import LogOutIcon from '~icons/lucide/log-out';
import KeyIcon from '~icons/lucide/key-round';
import LayoutGridIcon from '~icons/lucide/layout-grid';
import { ChangePasswordDialog } from './ChangePasswordDialog';
import { LanguageChoice, useUserLanguageSync } from './LanguageChoice';
import { useTheme } from '../contexts/ThemeContext';
import { EffectsLevel, useEffects } from '../contexts/EffectsContext';
import { usePageArrangeValue, usePageTitleValue } from '../contexts/PageTitleContext';
import { useWebSocketContext } from '../hooks/useWebsocket';
import { useRooms, useServiceMessages, useTrades } from '../queries';
import { ServiceMessagesSheet } from './ServiceMessages';
import { AlarmButton, AlarmsSheet } from './Alarms';
import { AdminLockButton } from './AdminLock';
import { getLocale } from '../paraglide/runtime';
import { m } from '../paraglide/messages';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from './ui/sheet';
import { Switch } from './ui/switch';
import { useWakeLock, useWakeLockSetting, wakeLockAvailable } from './WakeLock';
import { Label } from './ui/label';
import { Separator } from './ui/separator';

// A short reconnect (e.g. at startup) should not flash a warning
const CONNECTION_WARNING_DELAY_MS = 2000;

const useNow = () => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(timer);
  }, []);
  return now;
};

const Clock = () => {
  const now = useNow();
  const locale = getLocale();
  const date = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(now);
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(now);
  return (
    <span className="truncate text-sm text-muted-foreground">
      {date} · {time}
    </span>
  );
};

const NavLink = ({ onClick, icon, children }: { onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) => (
  <button
    onClick={onClick}
    className="flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-[15px] transition-colors hover:bg-accent [&_svg]:size-[18px] [&_svg]:shrink-0 [&_svg]:text-muted-foreground"
  >
    {icon}
    <span className="truncate">{children}</span>
  </button>
);

const NavSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="flex flex-col gap-0.5">
    <div className="px-3 pb-1 text-xs font-medium text-muted-foreground">{title}</div>
    {children}
  </div>
);

const effectLevels: { level: EffectsLevel; label: () => string }[] = [
  { level: 'off', label: m.EFFECTS_OFF },
  { level: 'subtle', label: m.EFFECTS_SUBTLE },
  { level: 'strong', label: m.EFFECTS_STRONG },
];

const NavMenu = ({
  open,
  onOpenChange,
  keepScreenOn,
  setKeepScreenOn,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  keepScreenOn: boolean;
  setKeepScreenOn: (on: boolean) => void;
}) => {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const effects = useEffects();
  const { authRequired, logout, userLevel } = useWebSocketContext();
  // Loaded when the menu is first opened, then kept in the query cache
  const { data: rooms = [] } = useRooms({ enabled: open });
  const { data: trades = [] } = useTrades({ enabled: open });
  const [changingPassword, setChangingPassword] = useState(false);
  const arrange = usePageArrangeValue();

  const go = (navigateTo: () => void) => {
    navigateTo();
    onOpenChange(false);
  };

  return (
    <>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-80 gap-0 overflow-y-auto">
        <SheetHeader className="pb-2">
          <SheetTitle>{m.NAVIGATION()}</SheetTitle>
          <SheetDescription className="sr-only">{m.MENU()}</SheetDescription>
        </SheetHeader>
        <nav className="flex flex-col gap-5 px-2 pb-4">
          {/* On phones the header has no room for it */}
          {arrange && (
            <div className="sm:hidden">
              <NavLink icon={<LayoutGridIcon />} onClick={() => go(arrange)}>
                {m.LAYOUT_ARRANGE()}
              </NavLink>
            </div>
          )}
          <NavSection title={m.ROOMS()}>
            {rooms.map((room) => (
              <NavLink
                key={room.id}
                icon={<HomeIcon />}
                onClick={() => go(() => navigate({ to: '/room/$roomId', params: { roomId: String(room.id) } }))}
              >
                {room.name}
              </NavLink>
            ))}
          </NavSection>
          <NavSection title={m.TRADES()}>
            {trades.map((trade) => (
              <NavLink
                key={trade.id}
                icon={<TagIcon />}
                onClick={() => go(() => navigate({ to: '/trade/$tradeId', params: { tradeId: String(trade.id) } }))}
              >
                {trade.name}
              </NavLink>
            ))}
          </NavSection>
          <NavSection title={m.VIEWS()}>
            <NavLink icon={<StarIcon />} onClick={() => go(() => navigate({ to: '/favorites' }))}>
              {m.FAVORITES()}
            </NavLink>
            <NavLink icon={<ListIcon />} onClick={() => go(() => navigate({ to: '/devices' }))}>
              {m.ALL_DEVICES()}
            </NavLink>
            <NavLink icon={<BracesIcon />} onClick={() => go(() => navigate({ to: '/sysvars' }))}>
              {m.SYSVARS()}
            </NavLink>
            <NavLink icon={<PlayIcon />} onClick={() => go(() => navigate({ to: '/programs' }))}>
              {m.PROGRAMS()}
            </NavLink>
            <NavLink icon={<ChartIcon />} onClick={() => go(() => navigate({ to: '/diagrams' }))}>
              {m.DIAGRAMS()}
            </NavLink>
            <NavLink icon={<HeartPulseIcon />} onClick={() => go(() => navigate({ to: '/health' }))}>
              {m.HEALTH()}
            </NavLink>
            {userLevel === 'admin' && (
              <NavLink icon={<SlidersIcon />} onClick={() => go(() => navigate({ to: '/setup' }))}>
                {m.SETUP()}
              </NavLink>
            )}
          </NavSection>
          <Separator />
          <NavSection title={m.APPEARANCE()}>
            <div className="flex h-11 items-center justify-between px-3">
              <Label htmlFor="dark-mode" className="text-[15px] font-normal">
                {m.DARK_MODE()}
              </Label>
              <Switch id="dark-mode" checked={theme.mode === 'dark'} onCheckedChange={toggleTheme} />
            </div>
            {wakeLockAvailable() && (
              <div className="flex flex-col px-3 pb-1">
                <div className="flex h-11 items-center justify-between">
                  <Label htmlFor="keep-screen-on" className="text-[15px] font-normal">
                    {m.KEEP_SCREEN_ON()}
                  </Label>
                  <Switch id="keep-screen-on" checked={keepScreenOn} onCheckedChange={setKeepScreenOn} />
                </div>
                <span className="text-xs text-muted-foreground">{m.KEEP_SCREEN_ON_HINT()}</span>
              </div>
            )}
            <div className="flex flex-col gap-2 px-3 pt-1">
              <span id="effects-label" className="text-[15px]">
                {m.EFFECTS()}
              </span>
              <div
                role="radiogroup"
                aria-labelledby="effects-label"
                className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1"
              >
                {effectLevels.map(({ level, label }) => (
                  <button
                    key={level}
                    role="radio"
                    aria-checked={effects.level === level}
                    onClick={() => effects.setLevel(level)}
                    className={cn(
                      'h-9 rounded-md text-sm font-medium transition-colors',
                      effects.level === level
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {label()}
                  </button>
                ))}
              </div>
              <span className="text-xs text-muted-foreground">{m.EFFECTS_HINT()}</span>
            </div>
            <LanguageChoice />
            <StartPageChoice />
          </NavSection>
          <NavSection title={m.PUSH_TITLE()}>
            <PushSettings onOpenRules={() => go(() => navigate({ to: '/rules' }))} />
          </NavSection>
          {authRequired && (
            <>
              <Separator />
              {(userLevel === 'admin' || userLevel === 'user') && (
                <NavLink
                  icon={<KeyIcon />}
                  onClick={() => {
                    onOpenChange(false);
                    setChangingPassword(true);
                  }}
                >
                  {m.PW_CHANGE()}
                </NavLink>
              )}
              <NavLink
                icon={<LogOutIcon />}
                onClick={() => {
                  onOpenChange(false);
                  logout();
                }}
              >
                {m.LOGOUT()}
              </NavLink>
            </>
          )}
        </nav>
      </SheetContent>
    </Sheet>
    {changingPassword && <ChangePasswordDialog onDone={() => setChangingPassword(false)} />}
    </>
  );
};

// Where the app opens: the view shown last or the favorites (per device)
const StartPageChoice = () => {
  const [page, setPage] = useState<StartPage>(getStartPage);
  const options: { value: StartPage; label: () => string }[] = [
    { value: 'last', label: m.START_PAGE_LAST },
    { value: 'favorites', label: m.FAVORITES },
  ];
  return (
    <div className="flex flex-col gap-2 px-3 pt-3">
      <span id="start-page-label" className="text-[15px]">
        {m.START_PAGE()}
      </span>
      <div role="radiogroup" aria-labelledby="start-page-label" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
        {options.map(({ value, label }) => (
          <button
            key={value}
            role="radio"
            aria-checked={page === value}
            onClick={() => {
              setStartPage(value);
              setPage(value);
            }}
            className={cn(
              'h-9 rounded-md text-sm font-medium transition-colors',
              page === value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {label()}
          </button>
        ))}
      </div>
    </div>
  );
};

export const Header: React.FC = () => {
  useUserLanguageSync();
  const title = usePageTitleValue();
  const arrange = usePageArrangeValue();
  const effects = useEffects();
  const [menuOpen, setMenuOpen] = useState(false);
  const [keepScreenOn, setKeepScreenOn] = useWakeLockSetting();
  useWakeLock(keepScreenOn);
  const [problemsOpen, setProblemsOpen] = useState(false);
  const [alarmsOpen, setAlarmsOpen] = useState(false);
  const { connectionStatus } = useWebSocketContext();
  const { data: serviceMessages } = useServiceMessages();
  const problemCount = serviceMessages?.length ?? 0;

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

  return (
    <header className="sticky top-0 z-40 border-b border-transparent bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-[72px] max-w-[1400px] items-center gap-3 px-4 sm:px-6">
        <Button variant="outline" size="icon-lg" onClick={() => setMenuOpen(true)} aria-label={m.MENU()}>
          <MenuIcon className="size-5" />
        </Button>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-xl leading-tight font-semibold tracking-tight sm:text-2xl">{title}</span>
          <Clock />
        </div>
        {arrange && (
          <Button
            variant="outline"
            size="icon-lg"
            className="hidden sm:inline-flex"
            onClick={arrange}
            aria-label={m.LAYOUT_ARRANGE()}
            title={m.LAYOUT_ARRANGE()}
          >
            <LayoutGridIcon className="size-5" />
          </Button>
        )}
        <AdminLockButton />
        <AlarmButton onClick={() => setAlarmsOpen(true)} />
        {problemCount > 0 && (
          <button
            onClick={() => setProblemsOpen(true)}
            aria-label={`${m.NOTICES()}: ${problemCount}`}
            className="press flex h-11 items-center gap-2.5 rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 text-[15px] font-medium text-amber-700 sm:px-4 dark:text-amber-300"
            style={
              effects.on ? { boxShadow: `0 0 ${20 * effects.k}px -4px rgba(251,191,36,${Math.min(1, 0.4 * effects.k)})` } : undefined
            }
          >
            <span className="relative block size-2">
              {effects.on && <span className="absolute inset-0 animate-ping rounded-full bg-amber-400" />}
              <span className="absolute inset-0 rounded-full bg-amber-400" />
            </span>
            <TriangleAlertIcon className="size-4 sm:hidden" />
            <span className="hidden sm:inline">
              {problemCount === 1 ? m.PROBLEMS_ONE() : m.PROBLEMS_MANY({ count: problemCount })}
            </span>
            <span className="sm:hidden">{problemCount}</span>
          </button>
        )}
        <span
          role="img"
          aria-label={connected ? m.CONNECTED() : m.CONNECTING()}
          title={connected ? m.CONNECTION_OK() : m.CONNECTING()}
          className={cn('size-2.5 shrink-0 rounded-full', connected ? 'bg-green-500' : 'bg-red-500')}
          style={connected && effects.on ? { boxShadow: `0 0 ${8 * effects.k}px rgba(34,197,94,0.7)` } : undefined}
        />
      </div>
      {showConnectionWarning && (
        <div role="status" className="bg-red-600 px-4 py-1.5 text-center text-sm font-medium text-white">
          {m.CONNECTION_LOST()}
        </div>
      )}
      <NavMenu open={menuOpen} onOpenChange={setMenuOpen} keepScreenOn={keepScreenOn} setKeepScreenOn={setKeepScreenOn} />
      <ServiceMessagesSheet open={problemsOpen} onOpenChange={setProblemsOpen} />
      <AlarmsSheet open={alarmsOpen} onOpenChange={setAlarmsOpen} />
    </header>
  );
};
