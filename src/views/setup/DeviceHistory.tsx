import { useQueries } from '@tanstack/react-query';
import { useWebSocketActions } from '../../hooks/useWebsocket';
import { useChannelList } from '../../queries';
import { PanelSkeleton } from '../../components/ui/skeleton';
import { datapointLabel, formatEntryValue, formatTime } from '../History';
import { defaultLang } from '../../i18n/utils';
import { m } from '../../paraglide/messages';
import type { HistoryEntry } from '../../types/protocol';

// How many of the newest protocol entries are searched for a channel
const SCAN = 500;

const numberFormat = new Intl.NumberFormat(defaultLang, { maximumFractionDigits: 1 });
const timeFormat = new Intl.DateTimeFormat(defaultLang, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export interface Point {
  t: number;
  v: number;
}

// The numeric series of a datapoint, oldest first; null if it isn't a number
export const toSeries = (entries: HistoryEntry[]): Point[] | null => {
  const points: Point[] = [];
  for (const e of entries) {
    const v = Number(e.value);
    const t = new Date(e.time.replace(' ', 'T')).getTime();
    if (e.value.trim() === '' || !Number.isFinite(v) || Number.isNaN(t)) return null;
    points.push({ t, v: e.datapoint === 'LEVEL' || e.datapoint === 'LEVEL_2' ? v * 100 : v });
  }
  return points.sort((a, b) => a.t - b.t);
};

const W = 320;
const H = 96;
const PAD = 4;

// A line of a series in a W×H box
export const linePath = (points: Point[]) => {
  if (points.length === 0) return '';
  const t0 = points[0].t;
  const t1 = points[points.length - 1].t;
  const vs = points.map((p) => p.v);
  const min = Math.min(...vs);
  const max = Math.max(...vs);
  const x = (t: number) => PAD + (t1 === t0 ? (W - 2 * PAD) / 2 : ((t - t0) / (t1 - t0)) * (W - 2 * PAD));
  const y = (v: number) => H - PAD - (max === min ? (H - 2 * PAD) / 2 : ((v - min) / (max - min)) * (H - 2 * PAD));
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
};

const Chart = ({ label, points, unit }: { label: string; points: Point[]; unit: string }) => {
  const vs = points.map((p) => p.v);
  const last = points[points.length - 1];
  return (
    <figure className="flex flex-col gap-1" aria-label={label}>
      <figcaption className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
        <span>{label}</span>
        <span className="font-medium text-foreground tabular-nums">
          {numberFormat.format(last.v)}
          {unit}
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-24 w-full rounded-md bg-muted/40" preserveAspectRatio="none" role="img" aria-label={label}>
        <path d={linePath(points)} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-primary" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between text-[11px] text-muted-foreground tabular-nums">
        <span>{timeFormat.format(points[0].t)}</span>
        <span>
          {m.DEVHIST_RANGE({ min: numberFormat.format(Math.min(...vs)), max: numberFormat.format(Math.max(...vs)) })}
          {unit}
        </span>
        <span>{timeFormat.format(last.t)}</span>
      </div>
    </figure>
  );
};

const unitOf = (datapoint: string) =>
  datapoint.includes('TEMPERATURE') ? ' °C' : datapoint === 'HUMIDITY' ? ' %' : datapoint.startsWith('LEVEL') ? ' %' : '';

// The history of the device's logged channels from the system protocol: a
// chart per numeric datapoint, the last changes of the others. A light
// stand-in for the WebUI's diagrams, which need the HMServer.
export const DeviceHistory = ({ address }: { address: string }) => {
  const { request } = useWebSocketActions();
  const { data: allChannels } = useChannelList();
  const logged = (allChannels ?? []).filter((c) => c.address.startsWith(`${address}:`) && c.logged);
  const histories = useQueries({
    queries: logged.map((channel) => ({
      queryKey: ['history', 'channel', channel.id],
      queryFn: async () => (await request({ type: 'getHistory', start: 0, count: SCAN, channel: channel.id })).entries,
      staleTime: 60000,
    })),
  });

  if (logged.length === 0) {
    return <p>{m.DEVHIST_NONE()}</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      {logged.map((channel, i) => {
        const entries = histories[i]?.data;
        if (!entries) return <PanelSkeleton key={channel.id} lines={2} />;
        const byDatapoint = new Map<string, HistoryEntry[]>();
        for (const e of entries) {
          const key = e.datapoint ?? '';
          byDatapoint.set(key, [...(byDatapoint.get(key) ?? []), e]);
        }
        return (
          <section key={channel.id} aria-label={channel.name} className="flex flex-col gap-3">
            <h3 className="text-sm font-medium">{channel.name}</h3>
            {byDatapoint.size === 0 && <p>{m.DEVHIST_EMPTY()}</p>}
            {[...byDatapoint.entries()].map(([datapoint, list]) => {
              const series = list.length > 1 ? toSeries(list) : null;
              return series ? (
                <Chart key={datapoint} label={datapointLabel(datapoint)} points={series} unit={unitOf(datapoint)} />
              ) : (
                <div key={datapoint} className="flex flex-col gap-1 text-sm">
                  <span className="text-xs text-muted-foreground">{datapointLabel(datapoint)}</span>
                  <ul className="flex flex-col gap-0.5">
                    {list.slice(0, 5).map((e, j) => (
                      <li key={j} className="flex justify-between gap-3 tabular-nums">
                        <span className="text-muted-foreground">{formatTime(e.time)}</span>
                        <span>{formatEntryValue(e)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </section>
        );
      })}
      <p className="text-xs">{m.DEVHIST_HINT({ count: SCAN })}</p>
    </div>
  );
};
