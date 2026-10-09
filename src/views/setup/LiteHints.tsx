import { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import ExternalLinkIcon from '~icons/lucide/external-link';
import { useWebSocketContext } from '../../hooks/useWebsocket';
import { usePageTitle } from '../../contexts/PageTitleContext';
import { m } from '../../paraglide/messages';
import { Panel } from './Panel';
import { Button } from '../../components/ui/button';

// openccu-lite shows the add-on in a frame of its own interface: its pages
// open in the whole window
const SystemLink = ({ href, children }: { href: string; children: ReactNode }) => (
  <li>
    <a href={href} target="_top" className="inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-4">
      {children}
      <ExternalLinkIcon className="size-3.5" aria-hidden />
    </a>
  </li>
);

// The settings openccu-lite has itself (occulited's pages), instead of the
// CCU's system settings
export const LiteSystemLinks = () => (
  <Panel aria-label={m.LITE_SYSTEM_TITLE()}>
    <h2>{m.LITE_SYSTEM_TITLE()}</h2>
    <p>{m.LITE_SYSTEM_HINT()}</p>
    <ul className="flex flex-wrap gap-x-5 gap-y-2">
      <SystemLink href="/system/network">{m.LITE_NETWORK()}</SystemLink>
      <SystemLink href="/system/firewall">{m.FW_TITLE()}</SystemLink>
      <SystemLink href="/system/users">{m.USERS()}</SystemLink>
      <SystemLink href="/system/backup">{m.LITE_BACKUP()}</SystemLink>
      <SystemLink href="/system/updates">{m.LITE_UPDATES()}</SystemLink>
      <SystemLink href="/system/log">{m.LITE_LOG()}</SystemLink>
      <SystemLink href="/addons">{m.ADDONS()}</SystemLink>
    </ul>
  </Panel>
);

// The openccu-lite session expired: only its login page renews it, the
// app's own login would never succeed. It opens in the whole window, as
// the gate in front of /addons/ would send a reload there.
export const SessionExpired = () => (
  <div className="flex min-h-screen items-center justify-center p-4">
    <div role="alert" className="tile-edge flex w-full max-w-sm flex-col gap-5 rounded-2xl border bg-card p-6 text-center shadow-sm">
      <h1 className="text-2xl font-semibold tracking-tight">{m.LITE_SESSION_EXPIRED()}</h1>
      <p className="text-sm text-muted-foreground">{m.LITE_SESSION_EXPIRED_HINT()}</p>
      <Button asChild size="lg">
        <a href="/login" target="_top">
          {m.LITE_SIGN_IN()}
        </a>
      </Button>
    </div>
  </div>
);

// openccu-lite has no programs and system variables: where automations go
// there instead
const LiteAutomation = () => {
  usePageTitle(m.LITE_AUTOMATION_TITLE());
  return (
    <Panel aria-label={m.LITE_AUTOMATION_TITLE()}>
      <h2>{m.LITE_AUTOMATION_TITLE()}</h2>
      <p>{m.LITE_AUTOMATION_HINT()}</p>
      <ul className="flex flex-wrap gap-x-5 gap-y-2">
        <SystemLink href="/addons/red/">{m.LITE_NODE_RED()}</SystemLink>
        <SystemLink href="/addons">{m.ADDONS()}</SystemLink>
      </ul>
      <p>{m.LITE_AUTOMATION_LINKS()}</p>
      <Link to="/setup/links" className="self-start text-sm font-medium underline underline-offset-4">
        {m.LINKS()}
      </Link>
    </Panel>
  );
};

// A page of programs or system variables, or on openccu-lite the hint
// where automations go there
export const LogicPage = ({ children }: { children: ReactNode }) => {
  const { capabilities } = useWebSocketContext();
  return capabilities.programs ? <>{children}</> : <LiteAutomation />;
};
