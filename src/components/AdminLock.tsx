import { useEffect, useState } from 'react';
import ShieldIcon from '~icons/lucide/shield-check';
import LockIcon from '~icons/lucide/lock';
import { useWebSocketContext } from '../hooks/useWebsocket';
import { useToast } from '../contexts/ToastContext';
import { m } from '../paraglide/messages';
import { errorText } from '../lib/errors';

// "7 h left", "12 min left" until the admin rights end
const timeLeft = (until: number, now: number) => {
  const minutes = Math.max(1, Math.ceil((until - now) / 60_000));
  return minutes >= 60 ? m.ADMIN_HOURS_LEFT({ hours: Math.round(minutes / 60) }) : m.ADMIN_MINUTES_LEFT({ minutes });
};

const useMinuteTick = () => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
};

// Admin rights to end: an administrator who entered the password, with
// authentication on (without it there is nothing to end)
const useAdminLock = () => {
  const { userLevel, elevated, elevatedUntil, endElevation } = useWebSocketContext();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const active = userLevel === 'admin' && elevated && elevatedUntil !== undefined;
  const end = async () => {
    setBusy(true);
    try {
      await endElevation();
      showToast(m.ADMIN_ENDED(), 'info');
    } catch (error) {
      showToast(errorText(error, m.CHANGE_FAILED));
    } finally {
      setBusy(false);
    }
  };
  return { active, elevatedUntil, busy, end };
};

// In the header while the admin rights are on, on every page: how long
// they last, and a click ends them
export const AdminLockButton = () => {
  const { active, elevatedUntil, busy, end } = useAdminLock();
  const now = useMinuteTick();
  if (!active || elevatedUntil === undefined) return null;
  const left = timeLeft(elevatedUntil, now);
  return (
    <button
      type="button"
      onClick={end}
      disabled={busy}
      aria-label={`${m.ADMIN_END()} (${left})`}
      title={m.ADMIN_END()}
      className="press group flex h-11 shrink-0 items-center gap-2 rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 text-sm font-medium text-amber-800 disabled:opacity-60 dark:text-amber-300"
    >
      <ShieldIcon className="size-4 group-hover:hidden" />
      <LockIcon className="hidden size-4 group-hover:block" />
      <span className="hidden flex-col items-start leading-tight sm:flex">
        <span>{m.ADMIN_MODE()}</span>
        <span className="text-xs font-normal opacity-80">{left}</span>
      </span>
    </button>
  );
};
