import SirenIcon from '~icons/lucide/siren';
import CheckIcon from '~icons/lucide/check';
import { AlarmMessage } from '../types/protocol';
import { useAcknowledgeAlarmMessage, useAlarmMessages } from '../queries';
import { useWebSocketContext } from '../hooks/useWebsocket';
import { useToast } from '../contexts/ToastContext';
import { useEffects } from '../contexts/EffectsContext';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from './ui/sheet';
import { Button } from './ui/button';
import { WebUILink } from './WebUILink';
import { getLocale } from '../paraglide/runtime';
import { m } from '../paraglide/messages';
import { cn } from '../lib/utils';
import { errorText } from '../lib/errors';

// Alarm messages: triggered alarm system variables (water, smoke, burglary
// through programs) that wait to be acknowledged, as the WebUI's
// "Alarmmeldungen" (rega/pages/tabs/statusviews/alarmMessages.htm).

// ReGa writes "2026-01-15 09:12:00"
export const formatAlarmTime = (time?: string) => {
  if (!time) return '';
  const date = new Date(time.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return time;
  const today = new Date().toDateString() === date.toDateString();
  return new Intl.DateTimeFormat(
    getLocale(),
    today ? { hour: '2-digit', minute: '2-digit' } : { dateStyle: 'short', timeStyle: 'short' },
  ).format(date);
};

const useAcknowledge = () => {
  const acknowledge = useAcknowledgeAlarmMessage();
  const { showToast } = useToast();
  const { userLevel } = useWebSocketContext();
  return {
    // Like service messages: operating, not for guests
    allowed: userLevel === 'admin' || userLevel === 'user',
    pending: acknowledge.isPending,
    run: (alarm: AlarmMessage) =>
      acknowledge.mutate(alarm.id, {
        onSuccess: () => showToast(m.ACKNOWLEDGED(), 'info'),
        onError: (error) => showToast(errorText(error, m.CHANGE_FAILED)),
      }),
  };
};

const detailOf = (alarm: AlarmMessage) =>
  [
    alarm.channel,
    alarm.roomName,
    formatAlarmTime(alarm.lastTime || alarm.firstTime),
    alarm.counter > 1 ? m.ALARM_TIMES({ count: alarm.counter }) : '',
  ]
    .filter(Boolean)
    .join(' · ');

const AlarmCard = ({ alarm }: { alarm: AlarmMessage }) => {
  const acknowledge = useAcknowledge();
  return (
    <li className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3">
      <span
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-full [&_svg]:size-5',
          alarm.active ? 'bg-red-500 text-white' : 'bg-red-500/20 text-red-600 dark:text-red-300',
        )}
      >
        <SirenIcon />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{alarm.name}</span>
        <span className="text-[13px] text-red-700 dark:text-red-300">
          {alarm.active ? alarm.message || m.ALARM_ACTIVE() : m.ALARM_OVER()}
        </span>
        <span className="truncate text-xs text-muted-foreground">{detailOf(alarm)}</span>
      </span>
      {acknowledge.allowed && (
        <Button
          size="sm"
          variant="outline"
          aria-label={`${m.ACKNOWLEDGE()}: ${alarm.name}`}
          disabled={acknowledge.pending}
          onClick={() => acknowledge.run(alarm)}
        >
          <CheckIcon />
          {m.ACKNOWLEDGE()}
        </Button>
      )}
    </li>
  );
};

export const AlarmsSheet = ({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) => {
  const { data: alarms = [] } = useAlarmMessages();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[min(440px,92vw)] gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{m.ALARMS()}</SheetTitle>
          <SheetDescription>
            <WebUILink />
          </SheetDescription>
        </SheetHeader>
        {alarms.length === 0 ? (
          <p className="px-4 text-sm text-muted-foreground">{m.NO_ALARMS()}</p>
        ) : (
          <ul aria-label={m.ALARMS()} className="flex flex-col gap-2 overflow-y-auto px-4 pb-4">
            {alarms.map((alarm) => (
              <AlarmCard key={alarm.id} alarm={alarm} />
            ))}
          </ul>
        )}
      </SheetContent>
    </Sheet>
  );
};

// The header's alarm button: red and pulsing while an alarm waits
export const AlarmButton = ({ onClick }: { onClick: () => void }) => {
  const { data: alarms = [] } = useAlarmMessages();
  const effects = useEffects();
  if (alarms.length === 0) return null;
  return (
    <button
      onClick={onClick}
      aria-label={`${m.ALARMS()}: ${alarms.length}`}
      className={cn(
        'press flex h-11 items-center gap-2 rounded-lg bg-red-600 px-3 text-[15px] font-semibold text-white sm:px-4 [&_svg]:size-4',
        effects.on && 'fx-alarm',
      )}
    >
      <SirenIcon />
      <span className="hidden sm:inline">
        {alarms.length === 1 ? m.ALARM_ONE() : m.ALARMS_MANY({ count: alarms.length })}
      </span>
      <span className="sm:hidden">{alarms.length}</span>
    </button>
  );
};

// Above the dashboard: the newest alarm, to acknowledge right there
export const AlarmBanner = ({ onShowAll }: { onShowAll: () => void }) => {
  const { data: alarms = [] } = useAlarmMessages();
  const acknowledge = useAcknowledge();
  const effects = useEffects();
  if (alarms.length === 0) return null;
  const alarm = [...alarms].sort((a, b) => (b.lastTime ?? '').localeCompare(a.lastTime ?? ''))[0];
  return (
    <section
      role="alert"
      aria-label={m.ALARMS()}
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-2xl bg-red-600 p-4 text-white',
        effects.on && 'fx-alarm',
      )}
    >
      <span className="relative flex size-11 shrink-0 items-center justify-center rounded-full bg-white/15 [&_svg]:size-6">
        {effects.on && <span className="absolute inset-0 animate-ping rounded-full bg-white/25" />}
        <SirenIcon />
      </span>
      <span className="flex min-w-0 flex-1 basis-48 flex-col">
        <span className="text-lg leading-tight font-semibold">
          {alarm.name}
          {alarm.active && alarm.message ? `: ${alarm.message}` : ''}
        </span>
        <span className="truncate text-sm text-white/80">
          {alarm.active ? detailOf(alarm) : `${m.ALARM_OVER()} · ${detailOf(alarm)}`}
        </span>
      </span>
      <span className="flex w-full justify-end gap-2 sm:w-auto">
        {alarms.length > 1 && (
          <Button variant="ghost" className="text-white hover:bg-white/15 hover:text-white" onClick={onShowAll}>
            {m.ALARMS_MORE({ count: alarms.length - 1 })}
          </Button>
        )}
        {acknowledge.allowed && (
          <Button
            className="bg-white text-red-700 hover:bg-white/90"
            disabled={acknowledge.pending}
            onClick={() => acknowledge.run(alarm)}
          >
            <CheckIcon />
            {m.ACKNOWLEDGE()}
          </Button>
        )}
      </span>
    </section>
  );
};
