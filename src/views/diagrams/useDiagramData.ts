import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWebSocketActions } from '../../hooks/useWebsocket';
import type { Diagram } from '../../types/protocol';
import { SYSVAR } from './DiagramEditor';
import { barInterval, intervalStart } from './chart';
import { keyOf, MINUTE } from './diagramModel';

// The time "now" that moves on every minute, so a live range follows it
export const useMinute = () => {
  const [now, setNow] = useState(() => Math.ceil(Date.now() / MINUTE) * MINUTE);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Math.ceil(Date.now() / MINUTE) * MINUTE), 30000);
    return () => window.clearInterval(id);
  }, []);
  return now;
};

// The values of a diagram's series from from to to, and those before from
// that bars of counters start with
export const useSeriesData = (diagram: Diagram, from: number, to: number, enabled: boolean, live: boolean) => {
  const { request } = useWebSocketActions();
  const start = intervalStart(from, barInterval(to - from)) - (to - from) / 4;
  return useQuery({
    // Live: one entry for the span that moves on with the minute
    // (refetchInterval), not a new one every minute, which would also show
    // the old values as placeholder and draw the chart in again
    queryKey: [
      'diagramData',
      diagram.id,
      diagram.series.map(keyOf).join(','),
      ...(live ? ['live', to - from] : [from, to]),
    ],
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

// New values of the series shown reload their diagrams, at most every few
// seconds: the server records them before passing them on
// Elsewhere (a room) the page subscribes to its own channels: then the
// events of those are used without asking for others
export const useLiveUpdates = (diagrams: Diagram[] | undefined, subscribeToSeries = true) => {
  const { subscribe, addEventListener } = useWebSocketActions();
  const queryClient = useQueryClient();
  const pending = useRef(new Map<string, number>());
  const addresses = useMemo(
    () =>
      [...new Set((diagrams ?? []).flatMap((d) => d.series.filter((s) => s.address !== SYSVAR).map((s) => s.address)))]
        .sort()
        .join('\n'),
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
