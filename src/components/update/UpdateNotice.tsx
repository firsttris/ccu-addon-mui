import { useEffect, useRef, useState } from 'react';
import DownloadIcon from '~icons/lucide/arrow-down-to-line';
import GiftIcon from '~icons/lucide/gift';
import PartyIcon from '~icons/lucide/party-popper';
import AlertIcon from '~icons/lucide/triangle-alert';
import ExternalIcon from '~icons/lucide/external-link';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { useCapabilities, useWebSocketActions, useWebSocketContext } from '../../hooks/useWebsocket';
import { isNewerVersion } from '../../utils/version';
import { takeOverNow, UPDATED_TO_KEY } from '../../lib/appUpdate';
import { useEffects } from '../../contexts/EffectsContext';
import { cn } from '../../lib/utils';
import { m } from '../../paraglide/messages';
import { UpdateWizard } from './UpdateWizard';
import { updateButton, UpdateHero, VersionJump } from './UpdateHero';

const SKIPPED_KEY = 'mui-update-skipped';
const LATER_KEY = 'mui-update-later';

const read = (storage: Storage, key: string) => {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
};
const write = (storage: Storage, key: string, value: string | null) => {
  try {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
  } catch {
    // private mode: asked again next time
  }
};

// Tells administrators once per visit that a new version of the add-on is
// out, and offers to install it (UpdateWizard). The server asks GitHub at
// most every 6 hours, so every start may ask it. "Später" waits for the next
// visit, "Überspringen" for the next version. Only where the add-on updates
// itself: openccu-lite updates add-ons on its own page (Zusatzsoftware).
export const UpdateNotice = () => {
  const { request } = useWebSocketActions();
  const { connectionStatus, authState, userLevel } = useWebSocketContext();
  const { selfUpdate } = useCapabilities();
  const effects = useEffects();
  const [latest, setLatest] = useState<{ current: string; latest: string } | null>(null);
  const [asked, setAsked] = useState(false);
  const [installing, setInstalling] = useState(false);
  const now = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (asked || !selfUpdate || connectionStatus !== 'Open' || authState !== 'authenticated' || userLevel !== 'admin')
      return;
    setAsked(true);
    request({ type: 'checkSelfUpdate' }, { timeoutMs: 30000 })
      .then((answer) => {
        const current = answer.current || import.meta.env.VITE_APP_VERSION || '';
        if (!answer.installable || !isNewerVersion(answer.latest, current)) return;
        if (read(localStorage, SKIPPED_KEY) === answer.latest || read(sessionStorage, LATER_KEY) === answer.latest)
          return;
        setLatest({ current, latest: answer.latest });
      })
      .catch(() => undefined);
  }, [asked, selfUpdate, connectionStatus, authState, userLevel, request]);

  if (!latest) return null;
  if (installing)
    return <UpdateWizard version={latest.latest} current={latest.current} onClose={() => setLatest(null)} />;

  const close = (key: string, storage: Storage) => {
    write(storage, key, latest.latest);
    setLatest(null);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && close(LATER_KEY, sessionStorage)}>
      <DialogContent
        className="gap-5 overflow-hidden outline-none sm:max-w-sm"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          now.current?.focus();
        }}
      >
        {effects.on && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-sky-500/15 via-violet-500/5 to-transparent"
          />
        )}
        <UpdateHero
          icon={<GiftIcon />}
          iconKey="gift"
          motion="fx-swing-a [animation-iteration-count:infinite] [animation-duration:2.4s]"
          progress={0}
          running
        />
        <DialogHeader className="relative items-center gap-3 text-center sm:items-center sm:text-center">
          <DialogTitle className="text-xl">{m.UPDATE_AVAILABLE()}</DialogTitle>
          <VersionJump from={latest.current} to={latest.latest} />
          <DialogDescription>
            {m.UPDATE_NEW_VERSION({ latest: latest.latest, current: latest.current })}
          </DialogDescription>
          <a
            href={`https://github.com/firsttris/ccu-addon-mui/releases/tag/v${latest.latest}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm font-medium text-sky-600 underline-offset-4 hover:underline dark:text-sky-300"
          >
            {m.UPDATE_WHATS_NEW()}
            <ExternalIcon className="size-3.5" />
          </a>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Button ref={now} size="lg" className={updateButton} onClick={() => setInstalling(true)}>
            <DownloadIcon />
            {m.UPDATE_NOW()}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => close(LATER_KEY, sessionStorage)}>
              {m.UPDATE_LATER()}
            </Button>
            <Button variant="ghost" className="text-muted-foreground" onClick={() => close(SKIPPED_KEY, localStorage)}>
              {m.UPDATE_SKIP()}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// After the update wizard reloaded the app: says it is done, once it runs
// the new version, else that it still runs the old one
export const UpdateDone = () => {
  const effects = useEffects();
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    const updated = read(sessionStorage, UPDATED_TO_KEY);
    write(sessionStorage, UPDATED_TO_KEY, null);
    setVersion(updated);
  }, []);
  if (!version) return null;
  const running = import.meta.env.VITE_APP_VERSION || '';
  const ok = !running || running === version;
  return (
    <Dialog open onOpenChange={(open) => !open && setVersion(null)}>
      <DialogContent className="gap-5 overflow-hidden outline-none sm:max-w-sm">
        {effects.on && (
          <div
            aria-hidden
            className={cn(
              'pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b to-transparent',
              ok ? 'from-green-500/15' : 'from-amber-500/15',
            )}
          />
        )}
        <UpdateHero
          icon={ok ? <PartyIcon /> : <AlertIcon />}
          iconKey={ok ? 'done' : 'old'}
          progress={1}
          tone={ok ? 'green' : 'amber'}
          celebrate={ok}
        />
        <DialogHeader className="relative items-center text-center sm:items-center sm:text-center">
          <DialogTitle className="text-xl">{ok ? m.UPDATE_DONE_TITLE() : m.UPDATE_OLD_APP_TITLE()}</DialogTitle>
          <DialogDescription>
            {ok ? m.UPDATE_DONE({ version }) : m.UPDATE_OLD_APP({ version, running })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-center">
          {!ok && (
            <Button variant="outline" onClick={() => void takeOverNow()}>
              {m.UPDATE_RELOAD_NOW()}
            </Button>
          )}
          <Button className="press" onClick={() => setVersion(null)}>
            {m.STATUS_OK()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
