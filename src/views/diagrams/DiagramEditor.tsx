import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import PlusIcon from '~icons/lucide/plus';
import XIcon from '~icons/lucide/x';
import { useWebSocketActions } from '../../hooks/useWebsocket';
import { useChannelList, useSysvars } from '../../queries';
import { useToast } from '../../contexts/ToastContext';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Input } from '../../components/ui/input';
import { NativeSelect } from '../../components/ui/select';
import { Button } from '../../components/ui/button';
import { datapointLabel } from '../History';
import { m } from '../../paraglide/messages';
import { palette, type Period } from './chart';
import type { Diagram, DiagramSeries } from '../../types/protocol';

export const MAX_SERIES = 12;
export const SYSVAR = 'sysvar';

// Datapoints that are no measured value
const skipped = /^(PRESS_|INSTALL_TEST|ON_TIME|RAMP_TIME|INHIBIT|WORKING|PROCESS|SECTION|COMBINED_PARAMETER|OPERATING_VOLTAGE_STATUS|CONFIG_PENDING|UPDATE_PENDING|ERROR_CODE)/;

// The unit of a datapoint, guessed from its name
export const guessUnit = (datapoint: string) => {
  if (datapoint.includes('TEMPERATURE')) return '°C';
  if (datapoint === 'HUMIDITY' || datapoint.startsWith('LEVEL') || datapoint === 'VALVE_STATE') return '%';
  if (datapoint === 'POWER' || datapoint.endsWith('_POWER')) return 'W';
  if (datapoint.endsWith('ENERGY_COUNTER')) return 'Wh';
  if (datapoint === 'VOLTAGE' || datapoint === 'OPERATING_VOLTAGE') return 'V';
  if (datapoint === 'CURRENT') return 'mA';
  if (datapoint === 'FREQUENCY') return 'Hz';
  if (datapoint === 'WIND_SPEED') return 'km/h';
  if (datapoint === 'ILLUMINATION' || datapoint === 'ILLUMINATION_LUX') return 'lx';
  if (datapoint === 'AIR_PRESSURE') return 'hPa';
  if (datapoint.includes('RSSI')) return 'dBm';
  return '';
};

export interface Candidate {
  series: DiagramSeries;
  name: string;
  detail: string;
}

// What can be added: the number and switch datapoints of all channels and
// the system variables that aren't text
export const useCandidates = () => {
  const { data: channels = [] } = useChannelList();
  const { data: sysvars = [] } = useSysvars();
  return useMemo(() => {
    const list: Candidate[] = [];
    for (const channel of channels) {
      for (const [datapoint, value] of Object.entries(channel.datapoints ?? {})) {
        if ((typeof value === 'number' || typeof value === 'boolean') && !skipped.test(datapoint)) {
          list.push({
            series: { address: channel.address, datapoint, unit: guessUnit(datapoint) },
            name: `${channel.name} · ${datapointLabel(datapoint)}`,
            detail: `${channel.address} ${datapoint}`,
          });
        }
      }
    }
    for (const sysvar of sysvars) {
      if (sysvar.kind !== 'string') {
        list.push({
          series: { address: SYSVAR, datapoint: String(sysvar.id), unit: sysvar.unit ?? '' },
          name: sysvar.name,
          detail: m.DIAG_SYSVAR(),
        });
      }
    }
    return list;
  }, [channels, sysvars]);
};

const seriesKey = (s: DiagramSeries) => `${s.address}.${s.datapoint}`;

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="flex flex-col gap-1.5 text-sm text-muted-foreground">
    {label}
    {children}
  </label>
);

// Creating or changing a diagram: its name, the period shown first and its
// data sources with color, label and unit (the WebUI's
// DiagramSettingsDetailPage, without its fixed value types)
export const DiagramEditor = ({ diagram, onClose }: { diagram?: Diagram; onClose: () => void }) => {
  const { request } = useWebSocketActions();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const candidates = useCandidates();
  const [name, setName] = useState(diagram?.name ?? '');
  const [period, setPeriod] = useState<Period>((diagram?.period || 'day') as Period);
  const [series, setSeries] = useState<DiagramSeries[]>(diagram?.series ?? []);
  const [query, setQuery] = useState('');

  const nameOf = (s: DiagramSeries) => candidates.find((c) => seriesKey(c.series) === seriesKey(s))?.name ?? `${s.address} ${s.datapoint}`;
  const used = new Set(series.map(seriesKey));
  const needle = query.trim().toLowerCase();
  const matches = needle
    ? candidates.filter((c) => !used.has(seriesKey(c.series)) && `${c.name} ${c.detail}`.toLowerCase().includes(needle)).slice(0, 30)
    : [];

  const save = useMutation({
    mutationFn: async () =>
      (
        await request({
          type: 'saveDiagram',
          diagram: { id: diagram?.id ?? '', name: name.trim(), period, series },
        })
      ).diagram,
    onSuccess: () => {
      showToast(m.DIAG_SAVED(), 'info');
      queryClient.invalidateQueries({ queryKey: ['diagrams'] });
      queryClient.invalidateQueries({ queryKey: ['diagramData'] });
      onClose();
    },
    onError: (error) => showToast(`${m.CHANGE_FAILED()}: ${error.message}`),
  });

  const valid = name.trim() !== '' && series.length > 0;
  const update = (index: number, change: Partial<DiagramSeries>) =>
    setSeries((list) => list.map((s, i) => (i === index ? { ...s, ...change } : s)));
  const freeColor = () => palette.find((c) => !series.some((s) => s.color === c)) ?? palette[series.length % palette.length];

  return (
    <ConfirmDialog
      title={diagram ? m.DIAG_EDIT({ name: diagram.name }) : m.DIAG_NEW()}
      confirmLabel={m.SAVE()}
      busy={!valid || save.isPending}
      onConfirm={() => save.mutate()}
      onCancel={onClose}
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) save.mutate();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Field label={m.NAME()}>
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
          </Field>
          <Field label={m.DIAG_PERIOD()}>
            <NativeSelect value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
              <option value="day">{m.DIAG_PERIOD_DAY()}</option>
              <option value="week">{m.DIAG_PERIOD_WEEK()}</option>
              <option value="month">{m.DIAG_PERIOD_MONTH()}</option>
              <option value="year">{m.DIAG_PERIOD_YEAR()}</option>
            </NativeSelect>
          </Field>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm text-muted-foreground">{m.DIAG_SERIES()}</legend>
          {series.length > 0 && (
            <ul className="flex flex-col divide-y rounded-lg border" aria-label={m.DIAG_SERIES()}>
              {series.map((s, i) => (
                <li key={seriesKey(s)} className="flex flex-col gap-2 p-2.5">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      aria-label={`${m.COLOR()} ${nameOf(s)}`}
                      value={s.color || palette[i % palette.length]}
                      onChange={(e) => update(i, { color: e.target.value })}
                      className="size-7 shrink-0 cursor-pointer rounded border bg-transparent p-0.5"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">{nameOf(s)}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label={m.DIAG_REMOVE_SERIES({ name: nameOf(s) })}
                      onClick={() => setSeries((list) => list.filter((_, j) => j !== i))}
                    >
                      <XIcon />
                    </Button>
                  </div>
                  <div className="grid grid-cols-[1fr_5.5rem] gap-2">
                    <Input
                      aria-label={`${m.DIAG_LABEL()} ${nameOf(s)}`}
                      placeholder={nameOf(s)}
                      value={s.label ?? ''}
                      maxLength={100}
                      onChange={(e) => update(i, { label: e.target.value })}
                      className="h-8"
                    />
                    <Input
                      aria-label={`${m.UNIT()} ${nameOf(s)}`}
                      placeholder={m.UNIT()}
                      value={s.unit ?? ''}
                      maxLength={20}
                      onChange={(e) => update(i, { unit: e.target.value })}
                      className="h-8"
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
          {series.length < MAX_SERIES ? (
            <>
              <Input
                type="search"
                aria-label={m.DIAG_ADD_SERIES()}
                placeholder={m.DIAG_SEARCH()}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {matches.length > 0 && (
                <ul className="flex max-h-56 flex-col overflow-y-auto rounded-lg border" aria-label={m.DIAG_ADD_SERIES()}>
                  {matches.map((c) => (
                    <li key={seriesKey(c.series)}>
                      <button
                        type="button"
                        aria-label={m.DIAG_ADD({ name: c.name })}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                        onClick={() => {
                          setSeries((list) => [...list, { ...c.series, color: freeColor() }]);
                          setQuery('');
                        }}
                      >
                        <PlusIcon className="size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate text-foreground">{c.name}</span>
                        <span className="shrink-0 font-mono text-xs text-muted-foreground">{c.detail}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">{m.DIAG_MAX_SERIES({ count: MAX_SERIES })}</p>
          )}
        </fieldset>
      </form>
    </ConfirmDialog>
  );
};
