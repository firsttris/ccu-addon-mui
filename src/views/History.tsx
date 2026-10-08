import { useMemo, useState } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import SearchIcon from '~icons/lucide/search';
import TrashIcon from '~icons/lucide/trash-2';
import { useWebSocketActions, useWebSocketContext } from '../hooks/useWebsocket';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { TableSkeletonRows } from '../components/ui/skeleton';
import { useToast } from '../contexts/ToastContext';
import { usePageTitle } from '../contexts/PageTitleContext';
import { defaultLang } from '../i18n/locale';
import { humanize } from '../controls/generic/parameters';
import { m } from '../paraglide/messages';
import type { HistoryEntry } from '../types/protocol';
import { errorText } from '../lib/errors';

const PAGE = 100;

const numberFormat = new Intl.NumberFormat(defaultLang, { maximumFractionDigits: 2 });
const dateFormat = new Intl.DateTimeFormat(defaultLang, { dateStyle: 'medium', timeStyle: 'medium' });

const texts = m as unknown as Record<string, (() => string) | undefined>;

// The name of a datapoint: the common ones translated, the rest made readable
export const datapointLabel = (datapoint: string) => texts[`HIST_DP_${datapoint}`]?.() ?? humanize(datapoint);

// "2026-10-03 21:00:05" as a local date
export const formatTime = (time: string) => {
  const date = new Date(time.replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? time : dateFormat.format(date);
};

// The value of an entry: the WebUI's text for system variables, else the
// raw value made readable (on/off, percent for levels)
export const formatEntryValue = (entry: HistoryEntry) => {
  if (entry.text) return entry.text;
  const { datapoint, value } = entry;
  if (value === 'true' || value === 'false') {
    const on = value === 'true';
    return datapoint === 'STATE' ? (on ? m.ON() : m.OFF()) : on ? m.HIST_YES() : m.HIST_NO();
  }
  const number = Number(value);
  if (value.trim() !== '' && Number.isFinite(number)) {
    if (datapoint === 'LEVEL' || datapoint === 'LEVEL_2') return `${numberFormat.format(number * 100)} %`;
    return numberFormat.format(number);
  }
  return value;
};

// The system protocol: changes of the datapoints logged in the CCU, newest
// first, as the WebUI's Status und Bedienung → Systemprotokoll
// (systemProtocol.htm, dom.GetHistoryData)
export const History = () => {
  usePageTitle(m.HIST_TITLE());
  const { request } = useWebSocketActions();
  const { userLevel, elevated } = useWebSocketContext();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [clearing, setClearing] = useState(false);

  const history = useInfiniteQuery({
    queryKey: ['history'],
    queryFn: ({ pageParam }) => request({ type: 'getHistory', start: pageParam, count: PAGE }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((sum, page) => sum + page.entries.length, 0);
      return loaded < last.total && last.entries.length > 0 ? loaded : undefined;
    },
    staleTime: 0,
  });

  const entries = useMemo(() => history.data?.pages.flatMap((page) => page.entries) ?? [], [history.data]);
  const total = history.data?.pages[0]?.total ?? 0;
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? entries.filter((e) => `${e.name} ${e.datapoint ? datapointLabel(e.datapoint) : ''} ${formatEntryValue(e)}`.toLowerCase().includes(needle))
    : entries;

  const clear = async () => {
    try {
      await request({ type: 'clearHistory' }, { queue: false });
      await queryClient.resetQueries({ queryKey: ['history'] });
      showToast(m.HIST_CLEARED(), 'info');
    } catch (error) {
      showToast(errorText(error, m.CHANGE_FAILED));
    }
    setClearing(false);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{m.HIST_TITLE()}</h1>
        <p className="text-sm text-muted-foreground">{m.HIST_HINT()}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-md flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label={m.SEARCH()}
            placeholder={m.SEARCH()}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        {userLevel === 'admin' && elevated && total > 0 && (
          <Button type="button" variant="outline" onClick={() => setClearing(true)}>
            <TrashIcon />
            {m.HIST_CLEAR()}
          </Button>
        )}
      </div>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table aria-label={m.HIST_TITLE()}>
          <TableHeader className="bg-muted/50">
            <TableRow className="hover:bg-transparent">
              <TableHead className="hidden w-48 sm:table-cell">{m.HIST_TIME()}</TableHead>
              <TableHead>{m.HIST_NAME()}</TableHead>
              <TableHead>{m.HIST_VALUE()}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.isPending && <TableSkeletonRows columns={3} rows={8} />}
            {shown.map((entry, index) => (
              <TableRow key={`${entry.time}-${entry.group}-${index}`}>
                <TableCell className="hidden whitespace-nowrap text-muted-foreground tabular-nums sm:table-cell">{formatTime(entry.time)}</TableCell>
                <TableCell className="font-medium">
                  {entry.name}
                  <span className="block text-xs font-normal text-muted-foreground tabular-nums sm:hidden">{formatTime(entry.time)}</span>
                </TableCell>
                <TableCell>
                  {entry.datapoint && <span className="mr-1.5 text-muted-foreground">{datapointLabel(entry.datapoint)}:</span>}
                  {formatEntryValue(entry)}
                </TableCell>
              </TableRow>
            ))}
            {!history.isPending && shown.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={3} className="py-10 text-center text-muted-foreground">
                  {entries.length === 0 ? m.HIST_EMPTY() : m.NO_RESULTS()}
                </TableCell>
              </TableRow>
            )}
            {history.isFetchingNextPage && <TableSkeletonRows columns={3} rows={3} />}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted-foreground">
          {history.isPending ? ' ' : m.HIST_COUNT({ shown: entries.length, total })}
        </p>
        {history.hasNextPage && (
          <Button type="button" variant="outline" size="sm" disabled={history.isFetchingNextPage} onClick={() => history.fetchNextPage()}>
            {m.HIST_MORE()}
          </Button>
        )}
      </div>

      {clearing && (
        <ConfirmDialog title={m.HIST_CLEAR()} confirmLabel={m.HIST_CLEAR()} destructive onConfirm={clear} onCancel={() => setClearing(false)}>
          {m.HIST_CLEAR_CONFIRM()}
        </ConfirmDialog>
      )}
    </div>
  );
};
