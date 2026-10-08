import { useEffect, useState } from 'react';
import DownloadIcon from '~icons/lucide/circle-arrow-down';
import PartyIcon from '~icons/lucide/party-popper';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { useWebSocketActions, useWebSocketContext } from '../../hooks/useWebsocket';
import { isNewerVersion } from '../../utils/version';
import { takeOverNow, UPDATED_TO_KEY } from '../../lib/appUpdate';
import { useEffects } from '../../contexts/EffectsContext';
import { cn } from '../../lib/utils';
import { m } from '../../paraglide/messages';
import { UpdateWizard } from './UpdateWizard';

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
// visit, "Überspringen" for the next version.
export const UpdateNotice = () => {
  const { request } = useWebSocketActions();
  const { connectionStatus, authState, userLevel } = useWebSocketContext();
  const effects = useEffects();
  const [latest, setLatest] = useState<{ current: string; latest: string } | null>(null);
  const [asked, setAsked] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (asked || connectionStatus !== 'Open' || authState !== 'authenticated' || userLevel !== 'admin') return;
    setAsked(true);
    request({ type: 'checkSelfUpdate' }, { timeoutMs: 30000 })
      .then((answer) => {
        const current = answer.current || import.meta.env.VITE_APP_VERSION || '';
        if (!answer.installable || !isNewerVersion(answer.latest, current)) return;
        if (read(localStorage, SKIPPED_KEY) === answer.latest || read(sessionStorage, LATER_KEY) === answer.latest) return;
        setLatest({ current, latest: answer.latest });
      })
      .catch(() => undefined);
  }, [asked, connectionStatus, authState, userLevel, request]);

  if (!latest) return null;
  if (installing) return <UpdateWizard version={latest.latest} onClose={() => setLatest(null)} />;

  const close = (key: string, storage: Storage) => {
    write(storage, key, latest.latest);
    setLatest(null);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && close(LATER_KEY, sessionStorage)}>
      <DialogContent>
        <DialogHeader className="items-center text-center sm:items-center sm:text-center">
          <span className="relative mb-1 flex size-14 items-center justify-center rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-300 [&_svg]:size-7">
            {effects.on && <span aria-hidden className="fx-wave absolute inset-0 rounded-full border-2 border-sky-500/40" />}
            <DownloadIcon className={cn(effects.on && 'animate-bounce')} />
          </span>
          <DialogTitle>{m.UPDATE_AVAILABLE()}</DialogTitle>
          <DialogDescription>{m.UPDATE_NEW_VERSION({ latest: latest.latest, current: latest.current })}</DialogDescription>
        </DialogHeader>
        <a
          href={`https://github.com/firsttris/ccu-addon-mui/releases/tag/v${latest.latest}`}
          target="_blank"
          rel="noreferrer"
          className="self-center text-sm font-medium underline underline-offset-4"
        >
          {m.UPDATE_WHATS_NEW()}
        </a>
        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" onClick={() => close(SKIPPED_KEY, localStorage)}>
            {m.UPDATE_SKIP()}
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => close(LATER_KEY, sessionStorage)}>
              {m.UPDATE_LATER()}
            </Button>
            <Button onClick={() => setInstalling(true)}>{m.UPDATE_NOW()}</Button>
          </div>
        </DialogFooter>
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
      <DialogContent>
        <DialogHeader className="items-center text-center sm:items-center sm:text-center">
          <span
            className={cn(
              'mb-1 flex size-14 items-center justify-center rounded-full [&_svg]:size-7',
              ok ? 'bg-green-500/15 text-green-600 dark:text-green-300' : 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
            )}
          >
            <PartyIcon className={cn(ok && effects.on && 'fx-bloom')} />
          </span>
          <DialogTitle>{ok ? m.UPDATE_DONE_TITLE() : m.UPDATE_OLD_APP_TITLE()}</DialogTitle>
          <DialogDescription>{ok ? m.UPDATE_DONE({ version }) : m.UPDATE_OLD_APP({ version, running })}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          {!ok && (
            <Button variant="outline" onClick={() => void takeOverNow()}>
              {m.UPDATE_RELOAD_NOW()}
            </Button>
          )}
          <Button onClick={() => setVersion(null)}>{m.STATUS_OK()}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
