import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import PlusIcon from '~icons/lucide/plus';
import PencilIcon from '~icons/lucide/pencil';
import TrashIcon from '~icons/lucide/trash-2';
import DownloadIcon from '~icons/lucide/download';
import ChevronLeftIcon from '~icons/lucide/chevron-left';
import ChevronRightIcon from '~icons/lucide/chevron-right';
import ZoomOutIcon from '~icons/lucide/zoom-out';
import MaximizeIcon from '~icons/lucide/maximize-2';
import HistoryIcon from '~icons/lucide/history';
import { useWebSocketActions, useWebSocketContext } from '../../hooks/useWebsocket';
import { usePageTitle } from '../../contexts/PageTitleContext';
import { useToast } from '../../contexts/ToastContext';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { PanelSkeleton, Skeleton } from '../../components/ui/skeleton';
import { Panel } from '../setup/Panel';
import { defaultLang } from '../../i18n/utils';
import { m } from '../../paraglide/messages';
import { cn } from '../../lib/utils';
import { TimeChart, formatSeriesValue, formatValue } from './TimeChart';
import { DiagramEditor, SYSVAR, useCandidates } from './DiagramEditor';
import {
  aggregatePoints,
  barInterval,
  defaultKind,
  downsample,
  intervalStart,
  palette,
  periods,
  scaleUnit,
  seriesStats,
  toBars,
  toCSV,
  type Aggregate,
  type ChartPoint,
  type ChartSeries,
  type Period,
  type RenderSeries,
} from './chart';
import type { Diagram, DiagramSeries, GetDiagramDataResponse } from '../../types/protocol';

const periodLabels: Record<Period, () => string> = {
  day: m.DIAG_PERIOD_DAY,
  week: m.DIAG_PERIOD_WEEK,
  month: m.DIAG_PERIOD_MONTH,
  year: m.DIAG_PERIOD_YEAR,
};

const rangeFormat = new Intl.DateTimeFormat(defaultLang, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const MINUTE = 60 * 1000;
// Points of a line: about one per two pixels of a wide chart
const MAX_LINE_POINTS = 600;

// Levels are recorded from 0 to 1 and shown in percent
const factorOf = (datapoint: string) => (/^LEVEL(_\d)?$/.test(datapoint) ? 100 : 1);
const keyOf = (s: { address: string; datapoint: string }) => `${s.address}.${s.datapoint}`;

// The time "now" that moves on every minute, so a live range follows it
const useMinute = () => {
  const [now, setNow] = useState(() => Math.ceil(Date.now() / MINUTE) * MINUTE);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Math.ceil(Date.now() / MINUTE) * MINUTE), 30000);
    return () => window.clearInterval(id);
  }, []);
  return now;
};

type Range = { period: Period; end: number | null } | { period: Period; from: number; to: number; zoomed: true };

// The values of a diagram's series from from to to, and those before from
// that bars of counters start with
const useSeriesData = (diagram: Diagram, from: number, to: number, enabled: boolean, live: boolean) => {
  const { request } = useWebSocketActions();
  const start = intervalStart(from, barInterval(to - from)) - (to - from) / 4;
  return useQuery({
    queryKey: ['diagramData', diagram.id, diagram.series.map(keyOf).join(','), from, to],
    queryFn: async () =>
      (
        await request({
          type: 'getDiagramData',
          series: diagram.series.map((s) => ({ address: s.address, datapoint: s.datapoint })),
          from: start,
          to,
          buckets: 1600,
        })
      ).series,
    placeholderData: (previous) => previous,
    staleTime: live ? 0 : 5 * MINUTE,
    // New values also come with events; this keeps a live chart moving
    refetchInterval: live ? MINUTE : false,
    enabled,
  });
};

// A series as drawn, from its settings and values
const toRender = (
  s: DiagramSeries,
  data: GetDiagramDataResponse['series'] | undefined,
  from: number,
  to: number,
  shift: number,
): Pick<RenderSeries, 'points' | 'bars' | 'kind' | 'aggregate'> & { key: string } => {
  const factor = factorOf(s.datapoint);
  const raw = (data?.find((d) => d.address === s.address && d.datapoint === s.datapoint)?.points ?? []) as ChartPoint[];
  const scaled = raw.map(([t, avg, lo, hi]) => [t + shift, avg * factor, lo * factor, hi * factor] as ChartPoint);
  const aggregate = (s.aggregate || 'avg') as Aggregate;
  const kind = s.chart || defaultKind(scaled, aggregate);
  const bars = kind === 'bar' || aggregate === 'delta' ? toBars(scaled, from, to, barInterval(to - from), aggregate) : [];
  let points = aggregatePoints(
    scaled.filter((p) => p[0] >= from),
    aggregate === 'delta' ? 'avg' : aggregate,
  );
  // Consumption as a line or area: a point per interval
  if (aggregate === 'delta' && kind !== 'bar') points = bars.map((b) => [(b.t0 + b.t1) / 2, b.v, b.v, b.v]);
  else if (kind !== 'state' && kind !== 'step') points = downsample(points, MAX_LINE_POINTS);
  return { key: keyOf(s), points, bars, kind, aggregate };
};

interface DiagramCardProps {
  diagram: Diagram;
  canEdit: boolean;
  names: Map<string, string>;
  // A tile in a room, trade or favorite list: smaller, without changing
  compact?: boolean;
}

const DiagramCard = ({ diagram, canEdit, names, compact = false }: DiagramCardProps) => {
  const { request } = useWebSocketActions();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const now = useMinute();
  const initial = (diagram.period || 'day') as Period;
  const [range, setRange] = useState<Range>({ period: initial, end: null });
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [compare, setCompare] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const span = periods[range.period];
  const [from, to] = 'zoomed' in range ? [range.from, range.to] : [(range.end ?? now) - span, range.end ?? now];
  const live = !('zoomed' in range) && range.end === null;
  const width = to - from;

  const data = useSeriesData(diagram, from, to, true, live);
  const before = useSeriesData(diagram, from - width, to - width, compare, false);

  const series: RenderSeries[] = useMemo(
    () =>
      diagram.series.map((s, i) => {
        const key = keyOf(s);
        const label = s.label || names.get(key) || `${s.address} ${s.datapoint}`;
        const current = toRender(s, data.data, from, to, 0);
        const previous = compare && before.data ? toRender(s, before.data, from, to, width) : null;
        // Wh and W in kWh and kW once they get large
        const largest = Math.max(0, ...current.bars.map((b) => Math.abs(b.v)), ...current.points.map((p) => Math.abs(p[3])));
        const { unit, factor } = scaleUnit(s.unit ?? '', largest);
        const scale = <T extends { points: ChartPoint[]; bars: RenderSeries['bars'] }>(r: T): T =>
          factor === 1
            ? r
            : {
                ...r,
                points: r.points.map(([t, a, lo, hi]) => [t, a * factor, lo * factor, hi * factor] as ChartPoint),
                bars: r.bars.map((b) => ({ ...b, v: b.v * factor })),
              };
        const scaledCurrent = scale(current);
        const scaledPrevious = previous ? scale(previous) : null;
        return {
          ...scaledCurrent,
          label,
          color: s.color || palette[i % palette.length],
          unit,
          axis: (s.axis || '') as RenderSeries['axis'],
          compare: scaledPrevious && current.kind !== 'state' ? { points: scaledPrevious.points, bars: scaledPrevious.bars } : undefined,
        };
      }),
    [diagram.series, data.data, before.data, compare, names, from, to, width],
  );
  const shown = series.filter((s) => !hidden.has(s.key));
  const empty = data.data !== undefined && series.every((s) => s.points.length === 0 && s.bars.length === 0);

  const remove = useMutation({
    mutationFn: () => request({ type: 'deleteDiagram', id: diagram.id }),
    onSuccess: () => {
      showToast(m.DIAG_DELETED(), 'info');
      queryClient.invalidateQueries({ queryKey: ['diagrams'] });
    },
    onError: (error) => showToast(`${m.CHANGE_FAILED()}: ${error.message}`),
    onSettled: () => setDeleting(false),
  });

  const exportCSV = () => {
    const table: ChartSeries[] = shown.map((s) => ({
      ...s,
      points: s.kind === 'bar' || s.aggregate === 'delta' ? s.bars.map((b) => [b.t0, b.v, b.v, b.v] as ChartPoint) : s.points,
    }));
    const csv = toCSV(table, defaultLang.startsWith('de'));
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${diagram.name.replace(/[^\p{L}\p{N}_-]+/gu, '_')}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const shift = (direction: -1 | 1) => {
    const end = to + direction * width;
    if (end >= now) setRange({ period: range.period, end: null });
    else if ('zoomed' in range) setRange({ ...range, from: from + direction * width, to: end });
    else setRange({ period: range.period, end });
  };
  // Draws in again on another range or other settings, not on new values
  const animationKey = [
    range.period,
    'zoomed' in range ? `${range.from}-${range.to}` : (range.end ?? 'live'),
    compare,
    JSON.stringify(diagram.series),
    data.data === undefined || data.isPlaceholderData,
  ].join('|');
  const zoom = (a: number, b: number) => setRange({ period: range.period, from: a, to: b, zoomed: true });

  const chart = (height: number) =>
    data.data === undefined ? (
      <Skeleton className="w-full" style={{ height }} />
    ) : empty ? (
      <div className="flex h-40 items-center justify-center rounded-lg bg-muted/40 text-sm text-muted-foreground">{m.DIAG_NO_DATA()}</div>
    ) : (
      <TimeChart label={diagram.name} series={shown} from={from} to={to} height={height} animationKey={animationKey} live={live} onZoom={zoom} />
    );

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <div role="group" aria-label={m.DIAG_PERIOD()} className="inline-flex rounded-lg bg-muted p-0.5">
        {(Object.keys(periods) as Period[]).map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={!('zoomed' in range) && range.period === p}
            onClick={() => setRange({ period: p, end: null })}
            className={cn(
              'h-7 rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors',
              !('zoomed' in range) && range.period === p && 'bg-background text-foreground shadow-xs',
            )}
          >
            {periodLabels[p]()}
          </button>
        ))}
      </div>
      <Button type="button" variant="outline" size="icon" className="size-7" aria-label={m.DIAG_EARLIER()} onClick={() => shift(-1)}>
        <ChevronLeftIcon />
      </Button>
      <Button type="button" variant="outline" size="icon" className="size-7" aria-label={m.DIAG_LATER()} disabled={live} onClick={() => shift(1)}>
        <ChevronRightIcon />
      </Button>
      {'zoomed' in range && (
        <Button type="button" variant="outline" size="sm" className="h-7" onClick={() => setRange({ period: range.period, end: null })}>
          <ZoomOutIcon />
          {m.DIAG_ZOOM_RESET()}
        </Button>
      )}
      <Button type="button" variant={compare ? 'secondary' : 'ghost'} size="sm" className="h-7" aria-pressed={compare} onClick={() => setCompare((c) => !c)}>
        <HistoryIcon />
        {m.DIAG_COMPARE()}
      </Button>
      <span className="flex items-center gap-2 text-xs text-muted-foreground tabular-nums" aria-live="polite">
        {live && (
          <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            {m.DIAG_LIVE()}
          </span>
        )}
        {rangeFormat.format(from)} – {rangeFormat.format(to)}
      </span>
    </div>
  );

  const legend = (
    <ul className={cn('grid gap-x-4 gap-y-1.5', compact && !fullscreen ? 'grid-cols-1' : 'sm:grid-cols-2 xl:grid-cols-3')} aria-label={m.DIAG_SERIES()}>
      {series.map((s) => {
        const stats = seriesStats(s);
        return (
          <li key={s.key}>
            <button
              type="button"
              aria-pressed={!hidden.has(s.key)}
              aria-label={m.DIAG_TOGGLE({ name: s.label })}
              onClick={() =>
                setHidden((set) => {
                  const next = new Set(set);
                  if (next.has(s.key)) next.delete(s.key);
                  else next.add(s.key);
                  return next;
                })
              }
              className={cn('flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-accent', hidden.has(s.key) && 'opacity-40')}
            >
              <span className="mt-1 h-3 w-1.5 shrink-0 rounded-full" style={{ background: s.color }} />
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="flex items-baseline gap-2">
                  <span className="truncate">{s.label}</span>
                  {stats && (
                    <span className="shrink-0 text-base font-semibold tabular-nums">
                      {stats.sum !== undefined ? formatValue(stats.sum, s.unit) : formatSeriesValue(s, stats.current)}
                    </span>
                  )}
                </span>
                {stats && s.kind !== 'state' && !(s.kind === 'step' && stats.min === 0 && stats.max === 1) && (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {stats.sum !== undefined
                      ? `${m.DIAG_STAT_SUM({ value: '' }).trim()} · ${m.DIAG_STAT_AVG({ value: formatValue(stats.avg, s.unit) })} · ${m.DIAG_STAT_RANGE({ min: formatValue(stats.min, s.unit), max: formatValue(stats.max, s.unit) })}`
                      : `${m.DIAG_STAT_AVG({ value: formatValue(stats.avg, s.unit) })} · ${m.DIAG_STAT_RANGE({ min: formatValue(stats.min, s.unit), max: formatValue(stats.max, s.unit) })}`}
                  </span>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <Panel aria-label={diagram.name}>
      <div className="flex flex-wrap items-center gap-1">
        <h2 className="mr-auto">{diagram.name}</h2>
        {!compact && (
          <Button type="button" variant="ghost" size="sm" className="h-8" disabled={empty || !data.data} onClick={exportCSV}>
            <DownloadIcon />
            <span className="hidden sm:inline">{m.DIAG_EXPORT()}</span>
          </Button>
        )}
        <Button type="button" variant="ghost" size="icon" className="size-8" aria-label={m.DIAG_FULLSCREEN()} onClick={() => setFullscreen(true)}>
          <MaximizeIcon />
        </Button>
        {canEdit && !compact && (
          <>
            <Button type="button" variant="ghost" size="icon" className="size-8" aria-label={m.EDIT()} onClick={() => setEditing(true)}>
              <PencilIcon />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="size-8" aria-label={m.DIAG_DELETE()} onClick={() => setDeleting(true)}>
              <TrashIcon />
            </Button>
          </>
        )}
      </div>
      {toolbar}
      {!fullscreen && chart(compact ? 210 : 300)}
      {legend}
      {!compact && !empty && data.data !== undefined && <p className="text-xs">{compare ? `${m.DIAG_ZOOM_HINT()} · ${m.DIAG_COMPARE_HINT()}` : m.DIAG_ZOOM_HINT()}</p>}
      {fullscreen && (
        <Dialog open onOpenChange={(open) => !open && setFullscreen(false)}>
          <DialogContent aria-label={diagram.name} className="flex max-h-[calc(100vh-16px)] w-[calc(100vw-16px)] max-w-[calc(100vw-16px)] flex-col gap-3 overflow-y-auto sm:max-w-[calc(100vw-32px)]">
            <DialogHeader>
              <DialogTitle>{diagram.name}</DialogTitle>
              <DialogDescription className="sr-only">{diagram.name}</DialogDescription>
            </DialogHeader>
            {toolbar}
            {chart(Math.max(320, Math.round(window.innerHeight * 0.62)))}
            {legend}
          </DialogContent>
        </Dialog>
      )}
      {editing && <DiagramEditor diagram={diagram} onClose={() => setEditing(false)} />}
      {deleting && (
        <ConfirmDialog title={m.DIAG_DELETE()} confirmLabel={m.DELETE()} destructive busy={remove.isPending} onConfirm={() => remove.mutate()} onCancel={() => setDeleting(false)}>
          {m.DIAG_DELETE_QUESTION({ name: diagram.name })}
        </ConfirmDialog>
      )}
    </Panel>
  );
};

// New values of the series shown reload their diagrams, at most every few
// seconds: the server records them before passing them on
// Elsewhere (a room) the page subscribes to its own channels: then the
// events of those are used without asking for others
const useLiveUpdates = (diagrams: Diagram[] | undefined, subscribeToSeries = true) => {
  const { subscribe, addEventListener } = useWebSocketActions();
  const queryClient = useQueryClient();
  const pending = useRef(new Map<string, number>());
  const addresses = useMemo(
    () => [...new Set((diagrams ?? []).flatMap((d) => d.series.filter((s) => s.address !== SYSVAR).map((s) => s.address)))].sort().join('\n'),
    [diagrams],
  );

  useEffect(() => {
    if (subscribeToSeries && addresses !== '') subscribe(addresses.split('\n'));
  }, [addresses, subscribe, subscribeToSeries]);

  useEffect(() => {
    const timers = pending.current;
    const remove = addEventListener((event) => {
      for (const diagram of diagrams ?? []) {
        if (!diagram.series.some((s) => s.address === event.channel && s.datapoint === event.datapoint)) continue;
        if (timers.has(diagram.id)) continue;
        timers.set(
          diagram.id,
          window.setTimeout(() => {
            timers.delete(diagram.id);
            queryClient.invalidateQueries({ queryKey: ['diagramData', diagram.id] });
          }, 3000),
        );
      }
    });
    return () => {
      remove();
      for (const timer of timers.values()) window.clearTimeout(timer);
      timers.clear();
    };
  }, [diagrams, addEventListener, queryClient]);
};

// The diagrams: open to everyone logged in, as the WebUI's Status und
// Bedienung → Diagramme (DiagramControlListPage); administrators create
// and change them
export const Diagrams = () => {
  usePageTitle(m.DIAGRAMS());
  const { request } = useWebSocketActions();
  const { userLevel, elevated } = useWebSocketContext();
  const canEdit = userLevel === 'admin' && elevated;
  const [creating, setCreating] = useState(false);
  const candidates = useCandidates();
  const names = useMemo(() => new Map(candidates.map((c) => [keyOf(c.series), c.name])), [candidates]);

  const diagrams = useQuery({
    queryKey: ['diagrams'],
    queryFn: async () => (await request({ type: 'getDiagrams' })).diagrams,
  });
  useLiveUpdates(diagrams.data);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{m.DIAGRAMS()}</h1>
        {canEdit && (
          <Button type="button" onClick={() => setCreating(true)}>
            <PlusIcon />
            {m.DIAG_NEW()}
          </Button>
        )}
      </div>
      {diagrams.data === undefined ? (
        <Panel aria-busy>
          <PanelSkeleton lines={6} />
        </Panel>
      ) : diagrams.data.length === 0 ? (
        <Panel>
          <p>{m.DIAG_NONE()}</p>
          {canEdit && <p>{m.DIAG_NONE_ADMIN()}</p>}
        </Panel>
      ) : (
        diagrams.data.map((diagram) => <DiagramCard key={diagram.id} diagram={diagram} canEdit={canEdit} names={names} />)
      )}
      <p className="text-xs text-muted-foreground">{m.DIAG_HINT()}</p>
      {creating && <DiagramEditor onClose={() => setCreating(false)} />}
    </>
  );
};

// The diagrams shown as tiles in a room, trade or favorite list
export const PlaceDiagrams = ({ place }: { place: number }) => {
  const { request } = useWebSocketActions();
  const diagrams = useQuery({
    queryKey: ['diagrams'],
    queryFn: async () => (await request({ type: 'getDiagrams' })).diagrams,
    // Without the recorder (an older server) there are none
    retry: false,
  });
  const shown = useMemo(() => (diagrams.data ?? []).filter((d) => d.places?.includes(place)), [diagrams.data, place]);
  useLiveUpdates(shown, false);
  return shown.length > 0 ? <PlaceDiagramTiles diagrams={shown} /> : null;
};

// Only rooms with diagrams load the names of all channels
const PlaceDiagramTiles = ({ diagrams: shown }: { diagrams: Diagram[] }) => {
  const candidates = useCandidates();
  const names = useMemo(() => new Map(candidates.map((c) => [keyOf(c.series), c.name])), [candidates]);
  return (
    <section aria-label={m.DIAGRAMS()} className="grid gap-4 lg:grid-cols-2">
      {shown.map((diagram) => (
        <DiagramCard key={diagram.id} diagram={diagram} canEdit={false} names={names} compact />
      ))}
    </section>
  );
};
