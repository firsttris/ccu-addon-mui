import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import RadioIcon from '~icons/lucide/radio-tower';
import BatteryLowIcon from '~icons/lucide/battery-low';
import RefreshIcon from '~icons/lucide/refresh-cw';
import ShieldAlertIcon from '~icons/lucide/shield-alert';
import TriangleAlertIcon from '~icons/lucide/triangle-alert';
import DownloadIcon from '~icons/lucide/download';
import CheckIcon from '~icons/lucide/check-check';
import { useAcknowledgeServiceMessage, useServiceMessages } from '../queries';
import { useWebSocketContext } from '../hooks/useWebsocket';
import { useToast } from '../contexts/ToastContext';
import { ServiceMessage } from '../types/protocol';
import { getLocale } from '../paraglide/runtime';
import { m } from '../paraglide/messages';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from './ui/sheet';
import { WebUILink } from './WebUILink';
import { errorText } from '../lib/errors';

type Severity = 'error' | 'warning' | 'info';

// The WebUI's text of a message by "<DATAPOINT>=TRUE" or "<DATAPOINT>"
// (stringtable_de.txt, imported by scripts/import-service-texts.mjs)
export type ServiceTexts = Record<string, { de: string; en?: string }>;

const known: Record<string, [() => string, Severity, React.ReactNode]> = {
  UNREACH: [m.SM_UNREACH, 'error', <RadioIcon />],
  STICKY_UNREACH: [m.SM_STICKY_UNREACH, 'warning', <RadioIcon />],
  LOW_BAT: [m.SM_LOW_BAT, 'warning', <BatteryLowIcon />],
  CONFIG_PENDING: [m.SM_CONFIG_PENDING, 'info', <RefreshIcon />],
  UPDATE_PENDING: [m.SM_UPDATE_PENDING, 'info', <DownloadIcon />],
  DEVICE_IN_BOOTLOADER: [m.SM_DEVICE_IN_BOOTLOADER, 'info', <DownloadIcon />],
  SABOTAGE: [m.SM_SABOTAGE, 'error', <ShieldAlertIcon />],
  STICKY_SABOTAGE: [m.SM_STICKY_SABOTAGE, 'warning', <ShieldAlertIcon />],
  DUTY_CYCLE: [m.SM_DUTY_CYCLE, 'warning', <RadioIcon />],
  ERROR_OVERHEAT: [m.SM_ERROR_OVERHEAT, 'error', <TriangleAlertIcon />],
  ERROR_OVERLOAD: [m.SM_ERROR_OVERLOAD, 'error', <TriangleAlertIcon />],
  ERROR_REDUCED: [m.SM_ERROR_REDUCED, 'warning', <TriangleAlertIcon />],
};

const normalize = (type: string) => (type === 'LOWBAT' ? 'LOW_BAT' : type);

// Loaded only when a message has none of our own texts
export const useServiceTexts = (messages: Pick<ServiceMessage, 'type'>[]) => {
  const needed = messages.some((message) => {
    const type = normalize(message.type);
    return !known[type] && type !== 'ERROR_CODE';
  });
  return useQuery({
    queryKey: ['serviceTexts'],
    queryFn: async () => (await import('./serviceMessages/texts.json')).default as ServiceTexts,
    staleTime: Infinity,
    enabled: needed,
  }).data;
};

// How a message reads and looks; other types read as in the WebUI, or
// keep the CCU's name
export const describeServiceMessage = (message: Pick<ServiceMessage, 'type' | 'value'>, texts?: ServiceTexts) => {
  const type = normalize(message.type);
  if (type === 'ERROR_CODE') {
    return { label: m.SM_ERROR_CODE({ value: message.value ?? '' }), severity: 'error' as Severity, icon: <TriangleAlertIcon /> };
  }
  const webUIText = () => {
    const text = texts?.[`${type}=TRUE`] ?? texts?.[type];
    return (getLocale() === 'en' && text?.en) || text?.de || type;
  };
  const [label, severity, icon] = known[type] ?? [webUIText, 'warning', <TriangleAlertIcon />];
  return { label: label(), severity, icon };
};

const severityClass: Record<Severity, string> = {
  error: 'bg-red-500/15 text-red-700 dark:text-red-300',
  warning: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  info: 'bg-sky-500/15 text-sky-800 dark:text-sky-300',
};

// "2026-01-15 09:12:00" as a short local date and time
const formatTimestamp = (timestamp?: string) => {
  if (!timestamp) return '';
  const date = new Date(timestamp.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return timestamp;
  return new Intl.DateTimeFormat(getLocale(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date);
};

// Messages of the same device together, in order of appearance
const groupByDevice = (messages: ServiceMessage[]) => {
  const devices = new Map<string, ServiceMessage[]>();
  for (const message of messages) {
    const key = message.address || message.name;
    devices.set(key, [...(devices.get(key) ?? []), message]);
  }
  return Array.from(devices.values());
};

// All service messages of the CCU, with acknowledging
export const ServiceMessagesSheet = ({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) => {
  const { data: messages = [] } = useServiceMessages();
  const { userLevel, platform } = useWebSocketContext();
  const { showToast } = useToast();
  const acknowledge = useAcknowledgeServiceMessage();
  const canAcknowledge = userLevel === 'admin' || userLevel === 'user';
  // openccu-lite's messages are read-only: only the sticky ones end by
  // acknowledging, the others when the device reports otherwise
  const acknowledgeable = (message: ServiceMessage) => platform !== 'lite' || message.type.startsWith('STICKY_');
  const texts = useServiceTexts(messages);

  const acknowledgeAll = async () => {
    try {
      for (const message of messages.filter(acknowledgeable)) {
        await acknowledge.mutateAsync(message.id);
      }
      showToast(m.ACKNOWLEDGED(), 'info');
    } catch (error) {
      showToast(errorText(error, m.CHANGE_FAILED));
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[min(440px,92vw)] gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{m.NOTICES()}</SheetTitle>
          <SheetDescription>
            <WebUILink />
          </SheetDescription>
        </SheetHeader>
        {messages.length === 0 ? (
          <p className="px-4 text-sm text-muted-foreground">{m.NO_SERVICE_MESSAGES()}</p>
        ) : (
          <>
            {canAcknowledge && messages.some(acknowledgeable) && (
              <div className="flex justify-end px-4 pb-3">
                <Button variant="outline" size="sm" onClick={acknowledgeAll} disabled={acknowledge.isPending}>
                  <CheckIcon />
                  {m.ACKNOWLEDGE_ALL()}
                </Button>
              </div>
            )}
            <ul aria-label={m.NOTICES()} className="flex flex-col gap-2 overflow-y-auto px-4 pb-4">
              {groupByDevice(messages).map((deviceMessages) => {
                const first = deviceMessages[0];
                return (
                  <li key={first.address || first.name} className="flex flex-col gap-2 rounded-xl border bg-card p-3">
                    <div className="flex flex-col">
                      <span className="font-medium">{first.name}</span>
                      <span className="text-sm text-muted-foreground">
                        {first.roomId ? (
                          <Link
                            to="/room/$roomId"
                            params={{ roomId: String(first.roomId) }}
                            onClick={() => onOpenChange(false)}
                            className="underline-offset-4 hover:underline"
                          >
                            {first.roomName}
                          </Link>
                        ) : (
                          m.NO_ROOM()
                        )}
                      </span>
                    </div>
                    <ul className="flex flex-col gap-1.5">
                      {deviceMessages.map((message) => {
                        const { label, severity, icon } = describeServiceMessage(message, texts);
                        return (
                          <li key={message.id} className="flex items-center gap-2">
                            <span
                              className={cn(
                                'inline-flex min-w-0 items-center gap-1.5 rounded-xl px-2 py-0.5 text-xs leading-snug font-medium [&_svg]:size-3 [&_svg]:shrink-0',
                                severityClass[severity],
                              )}
                            >
                              {icon}
                              <span className="break-words">{label}</span>
                            </span>
                            <span className="text-xs text-muted-foreground tabular-nums">{formatTimestamp(message.timestamp)}</span>
                            {canAcknowledge && acknowledgeable(message) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="ml-auto h-7 px-2 text-xs"
                                aria-label={`${m.ACKNOWLEDGE()}: ${first.name} ${label}`}
                                onClick={() =>
                                  acknowledge.mutate(message.id, {
                                    onError: (error) => showToast(errorText(error, m.CHANGE_FAILED)),
                                  })
                                }
                              >
                                {m.ACKNOWLEDGE()}
                              </Button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};
