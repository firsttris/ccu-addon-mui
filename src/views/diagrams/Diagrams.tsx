import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import PlusIcon from '~icons/lucide/plus';
import PencilIcon from '~icons/lucide/pencil';
import TrashIcon from '~icons/lucide/trash-2';
import DownloadIcon from '~icons/lucide/download';
import ChevronLeftIcon from '~icons/lucide/chevron-left';
import ChevronRightIcon from '~icons/lucide/chevron-right';
import ZoomOutIcon from '~icons/lucide/zoom-out';
import { useWebSocketActions, useWebSocketContext } from '../../hooks/useWebsocket';
import { usePageTitle } from '../../contexts/PageTitleContext';
import { useToast } from '../../contexts/ToastContext';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Button } from '../../components/ui/button';
import { PanelSkeleton, Skeleton } from '../../components/ui/skeleton';
import { Panel } from '../setup/Panel';
import { defaultLang } from '../../i18n/utils';
import { m } from '../../paraglide/messages';
import { cn } from '../../lib/utils';
import { TimeChart, formatValue } from './TimeChart';
import { DiagramEditor, useCandidates } from './DiagramEditor';
import { palette, periods, toCSV, type ChartPoint, type ChartSeries, type Period } from './chart';
import type { Diagram } from '../../types/protocol';

const periodLabels: Record<Period, () => string> = {
  day: m.DIAG_PERIOD_DAY,
  week: m.DIAG_PERIOD_WEEK,
  month: m.DIAG_PERIOD_MONTH,
  year: m.DIAG_PERIOD_YEAR,
};

const rangeFormat = new Intl.DateTimeFormat(defaultLang, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const MINUTE = 60 * 1000;

// Levels are recorded from 0 to 1 and shown in percent
const factorOf = (datapoint: string) => (/^LEVEL(_\d)?$/.test(datapoint) ? 100 : 1);

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

const DiagramCard = ({ diagram, canEdit, names }: { diagram: Diagram; canEdit: boolean; names: Map<string, string> }) => {
  const { request } = useWebSocketActions();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const now = useMinute();
  const initial = (diagram.period || 'day') as Period;
  const [range, setRange] = useState<Range>({ period: initial, end: null });
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const span = periods[range.period];
  const [from, to] = 'zoomed' in range ? [range.from, range.to] : [(range.end ?? now) - span, range.end ?? now];
  const live = !('zoomed' in range) && range.end === null;

  const data = useQuery({
    queryKey: ['diagramData', diagram.id, diagram.series.map((s) => `${s.address}.${s.datapoint}`).join(','), from, to],
    queryFn: async () =>
      (
        await request({
          type: 'getDiagramData',
          series: diagram.series.map((s) => ({ address: s.address, datapoint: s.datapoint })),
          from,
          to,
          buckets: 800,
        })
      ).series,
    placeholderData: (previous) => previous,
    staleTime: live ? 0 : 5 * MINUTE,
  });

  const series: ChartSeries[] = useMemo(
    () =>
      diagram.series.map((s, i) => {
        const key = `${s.address}.${s.datapoint}`;
        const factor = factorOf(s.datapoint);
        const points = (data.data?.find((d) => d.address === s.address && d.datapoint === s.datapoint)?.points ?? []) as ChartPoint[];
        return {
          key,
          label: s.label || names.get(key) || `${s.address} ${s.datapoint}`,
          color: s.color || palette[i % palette.length],
          unit: s.unit ?? '',
          points: factor === 1 ? points : points.map(([t, avg, lo, hi]) => [t, avg * factor, lo * factor, hi * factor] as ChartPoint),
        };
      }),
    [diagram.series, data.data, names],
  );
  const shown = series.filter((s) => !hidden.has(s.key));
  const empty = data.data !== undefined && series.every((s) => s.points.length === 0);

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
    const csv = toCSV(shown, defaultLang.startsWith('de'));
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${diagram.name.replace(/[^\p{L}\p{N}_-]+/gu, '_')}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const shift = (direction: -1 | 1) => {
    const width = to - from;
    const end = to + direction * width;
    if (end >= now) setRange({ period: range.period, end: null });
    else if ('zoomed' in range) setRange({ ...range, from: from + direction * width, to: end });
    else setRange({ period: range.period, end });
  };

  return (
    <Panel aria-label={diagram.name}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto">{diagram.name}</h2>
        {canEdit && (
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
        <span className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
          {rangeFormat.format(from)} – {rangeFormat.format(to)}
        </span>
        <Button type="button" variant="ghost" size="sm" className="ml-auto h-7" disabled={empty || !data.data} onClick={exportCSV}>
          <DownloadIcon />
          {m.DIAG_EXPORT()}
        </Button>
      </div>
      {data.data === undefined ? (
        <Skeleton className="h-[280px] w-full" />
      ) : empty ? (
        <div className="flex h-40 items-center justify-center rounded-lg bg-muted/40 text-sm text-muted-foreground">{m.DIAG_NO_DATA()}</div>
      ) : (
        <TimeChart
          label={diagram.name}
          series={shown}
          from={from}
          to={to}
          onZoom={(a, b) => setRange({ period: range.period, from: a, to: b, zoomed: true })}
        />
      )}
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5" aria-label={m.DIAG_SERIES()}>
        {series.map((s) => {
          const last = s.points[s.points.length - 1];
          const lo = Math.min(...s.points.map((p) => p[2]));
          const hi = Math.max(...s.points.map((p) => p[3]));
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
                className={cn('flex items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm hover:bg-accent', hidden.has(s.key) && 'opacity-40')}
              >
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                <span className="flex flex-col leading-tight">
                  <span>
                    {s.label}
                    {last && <span className="ml-2 font-medium tabular-nums">{formatValue(last[1], s.unit)}</span>}
                  </span>
                  {last && s.points.length > 1 && (
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {m.DIAG_MIN_MAX({ min: formatValue(lo, s.unit), max: formatValue(hi, s.unit) })}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {!empty && data.data !== undefined && <p className="text-xs">{m.DIAG_ZOOM_HINT()}</p>}
      {editing && <DiagramEditor diagram={diagram} onClose={() => setEditing(false)} />}
      {deleting && (
        <ConfirmDialog title={m.DIAG_DELETE()} confirmLabel={m.DELETE()} destructive busy={remove.isPending} onConfirm={() => remove.mutate()} onCancel={() => setDeleting(false)}>
          {m.DIAG_DELETE_QUESTION({ name: diagram.name })}
        </ConfirmDialog>
      )}
    </Panel>
  );
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
  const names = useMemo(() => new Map(candidates.map((c) => [`${c.series.address}.${c.series.datapoint}`, c.name])), [candidates]);

  const diagrams = useQuery({
    queryKey: ['diagrams'],
    queryFn: async () => (await request({ type: 'getDiagrams' })).diagrams,
  });

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
