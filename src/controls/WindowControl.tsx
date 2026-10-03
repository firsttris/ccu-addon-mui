import { Channel, DatapointValue } from '../types/types';
import { Tile } from '../components/Tile';
import { useEffects } from '../contexts/EffectsContext';
import { m } from '../paraglide/messages';
import { cn } from '../lib/utils';

export type WindowState = 'closed' | 'tilted' | 'open' | 'unknown';

// Window and door contacts report 0/false closed, 1/true open; window
// handles 0 closed, 1 tilted, 2 open (as the WebUI's iseButtonsWindow).
const HANDLE_TYPES = new Set(['ROTARY_HANDLE_SENSOR', 'ROTARY_HANDLE_TRANSCEIVER']);

export const windowState = (channel: Channel): WindowState => {
  const state = (channel.datapoints as Record<string, DatapointValue>).STATE;
  if (state === null || state === undefined) return 'unknown';
  if (HANDLE_TYPES.has(channel.type)) {
    return state === 0 ? 'closed' : state === 1 ? 'tilted' : state === 2 ? 'open' : 'unknown';
  }
  return state === true || state === 1 ? 'open' : state === false || state === 0 ? 'closed' : 'unknown';
};

const label: Record<WindowState, () => string> = {
  closed: m.WINDOW_CLOSED,
  tilted: m.WINDOW_TILTED,
  open: m.WINDOW_STATE_OPEN,
  unknown: m.WINDOW_UNKNOWN,
};

const tone: Record<WindowState, string> = {
  closed: 'text-muted-foreground',
  tilted: 'text-amber-700 dark:text-amber-300',
  open: 'text-sky-700 dark:text-sky-300',
  unknown: 'text-muted-foreground',
};

// A window seen from inside: the sash tilts in at the top or swings open
// to the side, the sky shows behind it. Handles turn the knob like the
// real one (down, up, sideways).
const WindowPicture = ({ state, handle }: { state: WindowState; handle: boolean }) => {
  const effects = useEffects();
  const a = (alpha: number) => Math.min(1, alpha * effects.k);
  const open = state === 'open';
  const tilted = state === 'tilted';
  const sash = open ? 'rotateY(-58deg)' : tilted ? 'rotateX(26deg)' : 'none';
  const knob = open ? 'rotate(90deg)' : tilted ? 'rotate(180deg)' : 'rotate(0deg)';
  return (
    <div
      aria-hidden
      className="relative h-[84px] w-[66px] shrink-0 rounded-[6px] border-[3px] border-zinc-400 bg-[linear-gradient(180deg,#bfe3fb,#86c3ee)] [perspective:260px] dark:border-zinc-600 dark:bg-[linear-gradient(180deg,#2a4a6b,#142a40)]"
      style={
        effects.on && (open || tilted)
          ? { boxShadow: `0 0 ${20 * effects.k}px -2px rgba(${open ? '125,211,252' : '251,191,36'},${a(open ? 0.5 : 0.35)})` }
          : undefined
      }
    >
      {/* Fresh air drifting in */}
      {effects.on && (open || tilted) && (
        <div className="absolute inset-0 overflow-hidden rounded-[3px]">
          {[18, 40, 62].map((top, i) => (
            <div
              key={top}
              className="fx-breeze absolute h-px w-8 rounded-full bg-white/70"
              style={{ top: `${top}%`, animationDelay: `${i * 0.6}s` }}
            />
          ))}
        </div>
      )}
      <div
        className={cn(
          'absolute inset-0 rounded-[3px] border-[3px] border-zinc-300 bg-sky-200/25 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.4)] transition-transform duration-700 ease-[cubic-bezier(.3,.7,.2,1)] dark:border-zinc-500 dark:bg-sky-300/10',
          tilted ? 'origin-bottom' : 'origin-left',
        )}
        style={{ transform: sash }}
      >
        {/* Reflection */}
        <div className="absolute top-1 left-1 h-6 w-2 -skew-x-12 rounded-full bg-white/40 dark:bg-white/10" />
        {handle && (
          <div
            className="absolute top-1/2 right-0.5 h-3.5 w-1.5 origin-top rounded-full bg-zinc-500 transition-transform duration-500 dark:bg-zinc-300"
            style={{ transform: knob }}
          />
        )}
      </div>
    </div>
  );
};

// Window and door contacts, window handles: the state as a picture
export const WindowControl = ({ channel }: { channel: Channel }) => {
  const state = windowState(channel);
  const effects = useEffects();
  const dp = channel.datapoints as Record<string, DatapointValue>;
  // Sabotage: the cover was opened (HmIP SABOTAGE, BidCos ERROR 1)
  const sabotage = dp.SABOTAGE === true || (channel.type === 'SHUTTER_CONTACT' && dp.ERROR === 1);
  const open = state === 'open' || state === 'tilted';
  return (
    <Tile
      status={channel.status}
      role="group"
      aria-label={channel.name}
      lit={open}
      className={cn(state === 'open' && 'border-sky-400/40', state === 'tilted' && 'border-amber-400/40')}
      style={
        open && effects.on
          ? {
              background: `radial-gradient(90% 90% at 0% 50%, rgba(${state === 'open' ? '125,211,252' : '251,191,36'},${Math.min(1, 0.1 * effects.k)}), transparent 70%), var(--card)`,
            }
          : undefined
      }
    >
      <div className="flex items-center gap-3.5 p-3.5">
        <WindowPicture state={state} handle={HANDLE_TYPES.has(channel.type)} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="line-clamp-2 text-[15px] leading-snug font-medium" title={channel.name}>
            {channel.name}
          </span>
          <span role="status" className={cn('text-[13px] font-medium', tone[state])}>
            {label[state]()}
          </span>
          {sabotage && <span className="text-xs font-medium text-red-600 dark:text-red-400">{m.SABOTAGE()}</span>}
        </div>
      </div>
    </Tile>
  );
};
