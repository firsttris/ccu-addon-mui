import { useEffect, useState } from 'react';
import ShieldIcon from '~icons/lucide/shield-check';
import LockIcon from '~icons/lucide/lock';
import { useWebSocketContext } from '../hooks/useWebsocket';
import { useToast } from '../contexts/ToastContext';
import { m } from '../paraglide/messages';

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
export const useAdminLock = () => {
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
      showToast(`${m.CHANGE_FAILED()}: ${error instanceof Error ? error.message : error}`);
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

// The admin mode in setting up, with ending it (without authentication
// there is no expiry and nothing to end)
export const AdminModeBadge = () => {
  const { active, elevatedUntil, busy, end } = useAdminLock();
  const now = useMinuteTick();
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-800 dark:text-amber-300">
        <ShieldIcon className="size-3.5" />
        {m.ADMIN_MODE()}
        {active && elevatedUntil !== undefined && ` · ${timeLeft(elevatedUntil, now)}`}
      </span>
      {active && (
        <button
          type="button"
          onClick={end}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium hover:bg-accent disabled:opacity-60"
        >
          <LockIcon className="size-3.5" />
          {m.ADMIN_END()}
        </button>
      )}
    </div>
  );
};
