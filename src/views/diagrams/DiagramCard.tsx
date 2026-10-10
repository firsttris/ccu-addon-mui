import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import DownloadIcon from '~icons/lucide/download';
import MaximizeIcon from '~icons/lucide/maximize-2';
import PencilIcon from '~icons/lucide/pencil';
import TrashIcon from '~icons/lucide/trash-2';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Skeleton } from '../../components/ui/skeleton';
import { useToast } from '../../contexts/ToastContext';
import { useWebSocketActions } from '../../hooks/useWebsocket';
import { defaultLang } from '../../i18n/locale';
import { errorText } from '../../lib/errors';
import { m } from '../../paraglide/messages';
import type { Diagram, EnergyPrice } from '../../types/protocol';
import { Panel } from '../setup/Panel';
import { type Period, toCSV } from './chart';
import { DiagramEditor } from './DiagramEditor';
import { DiagramLegend } from './DiagramLegend';
import { boundsOf, csvFileName, csvSeries, type Range, renderSeries, shifted } from './diagramModel';
import { DiagramToolbar } from './DiagramToolbar';
import { TimeChart } from './TimeChart';
import { useMinute, useSeriesData } from './useDiagramData';

const download = (name: string, csv: string) => {
  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = csvFileName(name);
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const toggled = (set: Set<string>, key: string) => {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
};

interface DiagramCardProps {
  diagram: Diagram;
  canEdit: boolean;
  names: Map<string, string>;
  // A tile in a room, trade or favorite list: smaller, without changing
  compact?: boolean;
  // For the costs of consumption
  energyPrice?: EnergyPrice;
}

// A diagram with its period, the chart and the legend; full screen in a
// dialog, administrators edit and delete it
export const DiagramCard = ({ diagram, canEdit, names, compact = false, energyPrice }: DiagramCardProps) => {
  const { request } = useWebSocketActions();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const now = useMinute();
  const [range, setRange] = useState<Range>({ period: (diagram.period || 'day') as Period, end: null });
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [compare, setCompare] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { from, to, live, width } = boundsOf(range, now);
  const data = useSeriesData(diagram, from, to, true, live);
  const before = useSeriesData(diagram, from - width, to - width, compare, false);
  const series = useMemo(
    () => renderSeries({ diagram, names, data: data.data, before: compare ? before.data : undefined, from, to }),
    [diagram, data.data, before.data, compare, names, from, to],
  );
  const shown = series.filter((s) => !hidden.has(s.key));
  const empty = data.data !== undefined && series.every((s) => s.points.length === 0 && s.bars.length === 0);

  const remove = useMutation({
    mutationFn: () => request({ type: 'deleteDiagram', id: diagram.id }),
    onSuccess: () => {
      showToast(m.DIAG_DELETED(), 'info');
      queryClient.invalidateQueries({ queryKey: ['diagrams'] });
    },
    onError: (error) => showToast(errorText(error, m.CHANGE_FAILED)),
    onSettled: () => setDeleting(false),
  });

  // Draws in again on another range or other settings, not on new values
  const animationKey = [
    range.period,
    'zoomed' in range ? `${range.from}-${range.to}` : (range.end ?? 'live'),
    compare,
    JSON.stringify(diagram.series),
    data.data === undefined || data.isPlaceholderData,
  ].join('|');

  const chart = (height: number) =>
    data.data === undefined ? (
      <Skeleton className="w-full" style={{ height }} />
    ) : empty ? (
      <div className="flex h-40 items-center justify-center rounded-lg bg-muted/40 text-sm text-muted-foreground">
        {m.DIAG_NO_DATA()}
      </div>
    ) : (
      <TimeChart
        label={diagram.name}
        series={shown}
        from={from}
        to={to}
        height={height}
        animationKey={animationKey}
        live={live}
        onZoom={(a, b) => setRange({ period: range.period, from: a, to: b, zoomed: true })}
      />
    );
  const toolbar = (
    <DiagramToolbar
      range={range}
      from={from}
      to={to}
      live={live}
      compare={compare}
      onRange={setRange}
      onShift={(direction) => setRange(shifted(range, direction, now))}
      onCompare={() => setCompare((c) => !c)}
    />
  );
  const legend = (
    <DiagramLegend
      series={series}
      hidden={hidden}
      narrow={compact && !fullscreen}
      energyPrice={energyPrice}
      onToggle={(key) => setHidden((set) => toggled(set, key))}
    />
  );

  return (
    <Panel aria-label={diagram.name}>
      <div className="flex flex-wrap items-center gap-1">
        <h2 className="mr-auto">{diagram.name}</h2>
        {!compact && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8"
            disabled={empty || !data.data}
            onClick={() => download(diagram.name, toCSV(csvSeries(shown), defaultLang.startsWith('de')))}
          >
            <DownloadIcon />
            <span className="hidden sm:inline">{m.DIAG_EXPORT()}</span>
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={m.DIAG_FULLSCREEN()}
          onClick={() => setFullscreen(true)}
        >
          <MaximizeIcon />
        </Button>
        {canEdit && !compact && (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label={m.EDIT()}
              onClick={() => setEditing(true)}
            >
              <PencilIcon />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label={m.DIAG_DELETE()}
              onClick={() => setDeleting(true)}
            >
              <TrashIcon />
            </Button>
          </>
        )}
      </div>
      {toolbar}
      {!fullscreen && chart(compact ? 210 : 300)}
      {legend}
      {!compact && !empty && data.data !== undefined && (
        <p className="text-xs">{compare ? `${m.DIAG_ZOOM_HINT()} · ${m.DIAG_COMPARE_HINT()}` : m.DIAG_ZOOM_HINT()}</p>
      )}
      {fullscreen && (
        <Dialog open onOpenChange={(open) => !open && setFullscreen(false)}>
          <DialogContent
            aria-label={diagram.name}
            className="flex max-h-[calc(100vh-16px)] w-[calc(100vw-16px)] max-w-[calc(100vw-16px)] flex-col gap-3 overflow-y-auto sm:max-w-[calc(100vw-32px)]"
          >
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
        <ConfirmDialog
          title={m.DIAG_DELETE()}
          confirmLabel={m.DELETE()}
          destructive
          busy={remove.isPending}
          onConfirm={() => remove.mutate()}
          onCancel={() => setDeleting(false)}
        >
          {m.DIAG_DELETE_QUESTION({ name: diagram.name })}
        </ConfirmDialog>
      )}
    </Panel>
  );
};
