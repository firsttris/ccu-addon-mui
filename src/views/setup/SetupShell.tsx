import { ReactNode, useState } from 'react';
import { Link } from '@tanstack/react-router';
import CpuIcon from '~icons/lucide/cpu';
import RadioIcon from '~icons/lucide/radio';
import LinkIcon from '~icons/lucide/link';
import MonitorSmartphoneIcon from '~icons/lucide/monitor-smartphone';
import UsersIcon from '~icons/lucide/users';
import InfoIcon from '~icons/lucide/info';
import HomeIcon from '~icons/lucide/house';
import BracesIcon from '~icons/lucide/braces';
import PlayIcon from '~icons/lucide/play';
import ShieldIcon from '~icons/lucide/shield-check';
import { useWebSocketContext } from '../../hooks/useWebsocket';
import { useInbox } from '../../queries';
import { ElevateDialog } from '../../components/ElevateDialog';
import { Button } from '../../components/ui/button';
import { m } from '../../paraglide/messages';
import { cn } from '../../lib/utils';

export const Notice = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200',
      className,
    )}
    {...props}
  />
);

const navLink =
  'flex h-9 shrink-0 items-center gap-2.5 rounded-lg px-3 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&_svg]:size-4 [&_svg]:shrink-0 data-[status=active]:bg-accent data-[status=active]:font-medium data-[status=active]:text-foreground';

const NavGroup = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="flex shrink-0 gap-0.5 lg:flex-col">
    <div className="hidden px-3 pb-1 text-xs font-medium text-muted-foreground lg:block">{title}</div>
    {children}
  </div>
);

// The setup area: a side menu on wide screens (a row of links on narrow
// ones), the elevation state, and the page. The logic pages (system
// variables, programs) live in it too, but are open to everyone who may
// operate, so they don't show the admin-only notice.
export const SetupShell = ({ children, adminOnly = true }: { children: ReactNode; adminOnly?: boolean }) => {
  const { userLevel, elevated, authRequired } = useWebSocketContext();
  const isAdmin = userLevel === 'admin';
  const [elevating, setElevating] = useState(false);
  const { data: inbox = [] } = useInbox({ enabled: isAdmin && elevated });

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6 px-4 pt-2 pb-10 sm:px-6 lg:flex-row">
      {/* Sticks exactly where it sits unscrolled (header 73px + pt-2), so it
          doesn't move down on long pages only and jump when switching pages */}
      <aside className="lg:sticky lg:top-[81px] lg:w-56 lg:shrink-0 lg:self-start">
        <nav
          aria-label={m.SETUP()}
          className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-1 [scrollbar-width:none] lg:flex-col lg:gap-5"
        >
          <NavGroup title={m.SETUP()}>
            <Link to="/setup" activeOptions={{ exact: true }} className={navLink}>
              <CpuIcon />
              {m.DEVICES()}
            </Link>
            {isAdmin && elevated && (
              <Link to="/setup/groups" className={navLink}>
                <HomeIcon />
                {m.ROOMS_AND_TRADES()}
              </Link>
            )}
            {isAdmin && elevated && (
              <Link to="/setup/links" className={navLink}>
                <LinkIcon />
                {m.LINKS()}
              </Link>
            )}
            {isAdmin && elevated && (
              <Link to="/setup/pairing" className={navLink}>
                <RadioIcon />
                <span className="flex-1">{m.PAIRING()}</span>
                {inbox.length > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
                    {inbox.length}
                  </span>
                )}
              </Link>
            )}
            {isAdmin && elevated && (
              <Link to="/setup/users" className={navLink}>
                <UsersIcon />
                {m.USERS()}
              </Link>
            )}
            {isAdmin && elevated && authRequired && (
              <Link to="/setup/sessions" className={navLink}>
                <MonitorSmartphoneIcon />
                {m.SESSIONS()}
              </Link>
            )}
            {isAdmin && (
              <Link to="/setup/system" className={navLink}>
                <InfoIcon />
                {m.SYSTEM()}
              </Link>
            )}
          </NavGroup>
          <NavGroup title={m.LOGIC()}>
            <Link to="/sysvars" className={navLink}>
              <BracesIcon />
              {m.SYSVARS()}
            </Link>
            <Link to="/programs" className={navLink}>
              <PlayIcon />
              {m.PROGRAMS()}
            </Link>
          </NavGroup>
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col gap-5">
        {!isAdmin && adminOnly && <Notice role="status">{m.ADMIN_ONLY()}</Notice>}
        {isAdmin && !elevated && (
          <Notice role="status">
            <span className="flex-1">{m.ELEVATE_HINT()}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => setElevating(true)}>
              {m.ELEVATE()}
            </Button>
          </Notice>
        )}
        {isAdmin && elevated && (
          <div className="flex justify-end">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-800 dark:text-amber-300">
              <ShieldIcon className="size-3.5" />
              {m.ADMIN_MODE()}
            </span>
          </div>
        )}
        {children}
      </div>
      {elevating && <ElevateDialog onDone={() => setElevating(false)} onCancel={() => setElevating(false)} />}
    </div>
  );
};
