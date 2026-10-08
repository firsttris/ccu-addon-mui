import { useEffect, useMemo, useState } from 'react';
import PlusIcon from '~icons/lucide/plus';
import SunriseIcon from '~icons/lucide/sunrise';
import SunsetIcon from '~icons/lucide/sunset';
import ClockIcon from '~icons/lucide/clock';
import TrashIcon from '~icons/lucide/trash-2';
import { useParamset, useParamsetDescription, usePutParamset } from '../../queries';
import { RequestError, useWebSocketContext } from '../../hooks/useWebsocket';
import { useToast } from '../../contexts/ToastContext';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../../components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { NativeSelect } from '../../components/ui/select';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ElevateDialog } from '../../components/ElevateDialog';
import { LevelBar } from '../light/LevelBar';
import { getLocale } from '../../paraglide/runtime';
import { m } from '../../paraglide/messages';
import { cn } from '../../lib/utils';
import {
  ALL_DAYS,
  changedValues,
  DAYS,
  deletedValues,
  entryValues,
  formatTime,
  freeNumber,
  parseWeekProgram,
  targetIndexes,
  Values,
  WEEKEND,
  WeekProgramEntry,
  WORKDAYS,
} from './weekProgram';

export type WeekProgramKind = 'switch' | 'blind' | 'dimmer';

export interface TargetChannel {
  // Bit in WP_TARGET_CHANNELS
  index: number;
  label: string;
}

interface WeekProgramSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  interfaceName: string;
  // The *_WEEK_PROFILE channel
  address: string;
  name: string;
  kind: WeekProgramKind;
  targets: TargetChannel[];
}

// Monday is 2024-01-01
const dayName = (dayIndex: number, style: 'short' | 'long') =>
  new Intl.DateTimeFormat(getLocale(), { weekday: style }).format(new Date(2024, 0, 1 + dayIndex));

export const formatDays = (mask: number) => {
  if (mask === ALL_DAYS) return m.EVERY_DAY();
  if (mask === WORKDAYS) return m.WORKDAYS();
  if (mask === WEEKEND) return m.WEEKEND();
  return DAYS.map((day, i) => ((mask & day.bit) !== 0 ? dayName(i, 'short') : null))
    .filter(Boolean)
    .join(', ');
};

// WP_LEVEL above 1 are special values ("old level", "unchanged")
const isSpecial = (level: number) => level > 1;

const levelText = (kind: WeekProgramKind, level: number) => {
  if (isSpecial(level)) return level < 1.008 ? m.WP_OLD_LEVEL() : m.WP_UNCHANGED();
  if (kind === 'switch') return level > 0 ? m.ON() : m.OFF();
  if (kind === 'blind') return level === 0 ? m.BLIND_CLOSED() : m.BLIND_PERCENT_OPEN({ percent: Math.round(level * 100) });
  return level === 0 ? m.OFF() : m.DIMMED_TO({ percent: Math.round(level * 100) });
};

const timeText = (entry: WeekProgramEntry) => {
  const offset = entry.astroOffset ? ` ${entry.astroOffset > 0 ? '+' : '−'}${Math.abs(entry.astroOffset)} min` : '';
  const astro = `${entry.astroType === 0 ? m.SUNRISE() : m.SUNSET()}${offset}`;
  if (entry.condition === 0) return formatTime(entry.hour, entry.minute);
  if (entry.condition === 1) return astro;
  // Combinations of both, as the WebUI offers them
  return `${formatTime(entry.hour, entry.minute)} / ${astro}`;
};

const TimeIcon = ({ entry }: { entry: WeekProgramEntry }) =>
  entry.condition === 1 ? entry.astroType === 0 ? <SunriseIcon /> : <SunsetIcon /> : <ClockIcon />;

// --- Editing one switching point

const segment = 'press flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors';

const EntryDialog = ({
  entry,
  kind,
  targets,
  hasLevel2,
  onSave,
  onDelete,
  onCancel,
}: {
  entry: WeekProgramEntry;
  kind: WeekProgramKind;
  targets: TargetChannel[];
  hasLevel2: boolean;
  onSave: (entry: WeekProgramEntry) => void;
  onDelete: () => void;
  onCancel: () => void;
}) => {
  const [draft, setDraft] = useState(entry);
  const set = (patch: Partial<WeekProgramEntry>) => setDraft((d) => ({ ...d, ...patch }));
  const mode = draft.condition === 1 ? (draft.astroType === 0 ? 'sunrise' : 'sunset') : draft.condition === 0 ? 'fixed' : 'combined';
  const minutes = useMemo(() => {
    const steps = Array.from({ length: 12 }, (_, i) => i * 5);
    return steps.includes(draft.minute) ? steps : [...steps, draft.minute].sort((a, b) => a - b);
  }, [draft.minute]);
  const valid = draft.weekdays !== 0 && (targets.length === 0 || draft.targets !== 0);

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent aria-label={m.SWITCHING_POINT()} className="max-h-[calc(100vh-32px)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{m.SWITCHING_POINT()}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-5">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">{m.DAYS()}</legend>
            <div className="grid grid-cols-7 gap-1">
              {DAYS.map((day, i) => {
                const on = (draft.weekdays & day.bit) !== 0;
                return (
                  <button
                    key={day.key}
                    type="button"
                    aria-pressed={on}
                    aria-label={dayName(i, 'long')}
                    onClick={() => set({ weekdays: draft.weekdays ^ day.bit })}
                    className={cn(
                      'press h-10 rounded-lg border text-sm font-medium',
                      on ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-accent',
                    )}
                  >
                    {dayName(i, 'short')}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[
                [ALL_DAYS, m.EVERY_DAY()],
                [WORKDAYS, m.WORKDAYS()],
                [WEEKEND, m.WEEKEND()],
              ].map(([mask, label]) => (
                <Button key={label} type="button" size="sm" variant="outline" onClick={() => set({ weekdays: mask as number })}>
                  {label}
                </Button>
              ))}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">{m.TIME()}</legend>
            <div className="flex gap-1 rounded-xl bg-muted p-1" role="radiogroup" aria-label={m.TIME()}>
              {(
                [
                  ['fixed', m.FIXED_TIME(), { condition: 0 }],
                  ['sunrise', m.SUNRISE(), { condition: 1, astroType: 0 }],
                  ['sunset', m.SUNSET(), { condition: 1, astroType: 1 }],
                ] as const
              ).map(([key, label, patch]) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={mode === key}
                  onClick={() => set(patch)}
                  className={cn(segment, mode === key ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')}
                >
                  {label}
                </button>
              ))}
            </div>
            {mode === 'combined' && <p className="text-xs text-muted-foreground">{m.WP_COMBINED_HINT()}</p>}
            {(mode === 'fixed' || mode === 'combined') && (
              <div className="flex items-center gap-2">
                <NativeSelect aria-label={m.HOUR()} value={draft.hour} onChange={(e) => set({ hour: Number(e.target.value) })} className="w-20">
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, '0')}
                    </option>
                  ))}
                </NativeSelect>
                <span className="text-lg font-semibold">:</span>
                <NativeSelect aria-label={m.MINUTE()} value={draft.minute} onChange={(e) => set({ minute: Number(e.target.value) })} className="w-20">
                  {minutes.map((min) => (
                    <option key={min} value={min}>
                      {String(min).padStart(2, '0')}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            )}
            {mode !== 'fixed' && (
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                {m.OFFSET()}
                <NativeSelect value={draft.astroOffset} onChange={(e) => set({ astroOffset: Number(e.target.value) })} className="w-32">
                  {Array.from({ length: 17 }, (_, i) => (i - 8) * 15)
                    .concat(draft.astroOffset % 15 ? [draft.astroOffset] : [])
                    .sort((a, b) => a - b)
                    .map((offset) => (
                      <option key={offset} value={offset}>
                        {offset > 0 ? '+' : ''}
                        {offset} min
                      </option>
                    ))}
                </NativeSelect>
              </label>
            )}
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">{m.ACTION()}</legend>
            {kind === 'switch' ? (
              <div className="flex gap-1 rounded-xl bg-muted p-1" role="radiogroup" aria-label={m.ACTION()}>
                {(
                  [
                    [1, m.ON()],
                    [0, m.OFF()],
                  ] as const
                ).map(([level, label]) => (
                  <button
                    key={level}
                    type="button"
                    role="radio"
                    aria-checked={draft.level === level}
                    onClick={() => set({ level })}
                    className={cn(segment, draft.level === level ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : (
              <>
                {isSpecial(draft.level) && <p className="text-sm text-muted-foreground">{levelText(kind, draft.level)}</p>}
                <LevelBar
                  label={kind === 'blind' ? m.BLIND_POSITION({ name: '' }).trim() : m.BRIGHTNESS()}
                  value={isSpecial(draft.level) ? 100 : Math.round(draft.level * 100)}
                  color={kind === 'blind' ? [148, 163, 184] : undefined}
                  onChange={(v) => set({ level: v / 100 })}
                />
                {kind === 'blind' && hasLevel2 && draft.level2 !== undefined && (
                  <LevelBar
                    label={m.SLATS()}
                    value={isSpecial(draft.level2) ? 100 : Math.round(draft.level2 * 100)}
                    color={[148, 163, 184]}
                    onChange={(v) => set({ level2: v / 100 })}
                  />
                )}
              </>
            )}
          </fieldset>

          {targets.length > 1 && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">{m.TARGET_CHANNELS()}</legend>
              {targets.map((target) => (
                <label key={target.index} className="flex items-center gap-2.5 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={(draft.targets & (1 << target.index)) !== 0}
                    onChange={() => set({ targets: draft.targets ^ (1 << target.index) })}
                  />
                  {target.label}
                </label>
              ))}
            </fieldset>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
            <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={onDelete}>
              <TrashIcon />
              {m.DELETE()}
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onCancel}>
                {m.CANCEL()}
              </Button>
              <Button type="button" disabled={!valid} onClick={() => onSave(draft)}>
                {m.APPLY()}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// --- The week program

// The switching times of an HmIP actuator's own week program, as cards;
// changes are collected and saved together after a confirmation.
export const WeekProgramSheet = ({ open, onOpenChange, interfaceName, address, name, kind, targets }: WeekProgramSheetProps) => {
  const { userLevel, elevated } = useWebSocketContext();
  const { showToast } = useToast();
  const canEdit = userLevel === 'admin' && elevated;
  const { data: description, isPending } = useParamsetDescription(interfaceName, address, 'MASTER', { enabled: open });
  const { data: values } = useParamset(interfaceName, address, 'MASTER', { enabled: open });
  const putParamset = usePutParamset();

  // Unsaved edits: entry number → new entry, or null when deleted
  const [drafts, setDrafts] = useState<Record<string, WeekProgramEntry | null>>({});
  const [editing, setEditing] = useState<WeekProgramEntry | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [elevating, setElevating] = useState(false);
  useEffect(() => {
    if (open) setDrafts({});
  }, [open]);

  const stored = useMemo(() => (description && values ? parseWeekProgram(description, values as Values) : []), [description, values]);
  const entries = useMemo(() => {
    const byNumber = new Map(stored.map((e) => [e.number, e]));
    for (const [number, entry] of Object.entries(drafts)) {
      if (entry) byNumber.set(number, entry);
      else byNumber.delete(number);
    }
    return parseWeekProgram(
      description ?? {},
      Object.fromEntries(
        [...byNumber.values()].flatMap((e) => Object.entries(entryValues(description ?? {}, e))),
      ) as Values,
    );
  }, [stored, drafts, description]);

  const changes = useMemo(() => {
    if (!description || !values) return {};
    const next: Values = {};
    for (const [number, entry] of Object.entries(drafts)) {
      Object.assign(next, entry ? entryValues(description, entry) : deletedValues(description, number));
    }
    return changedValues(values as Values, next);
  }, [drafts, description, values]);
  const changeCount = Object.keys(changes).length;
  // Switching points with a change (each is several parameters)
  const editedCount = new Set(Object.keys(changes).map((name) => name.slice(0, 2))).size;
  const hasLevel2 = Boolean(description && Object.keys(description).some((n) => n.endsWith('_WP_LEVEL_2')));

  const addEntry = () => {
    if (!description || !values) return;
    const number = freeNumber(description, values as Values, new Set(Object.keys(drafts)));
    if (!number) {
      showToast(m.WP_FULL());
      return;
    }
    // As the WebUI: every day; the first target channel
    setEditing({
      number,
      weekdays: ALL_DAYS,
      condition: 0,
      hour: 7,
      minute: 0,
      astroType: 0,
      astroOffset: 0,
      targets: targets.length > 0 ? 1 << targets[0].index : 1,
      level: kind === 'switch' ? 1 : 1,
      level2: hasLevel2 ? 0 : undefined,
    });
  };

  const save = () =>
    putParamset.mutate(
      { interfaceName, address, values: changes },
      {
        onSuccess: () => {
          setDrafts({});
          showToast(m.SAVED(), 'info');
        },
        onError: (error) => {
          if (error instanceof RequestError && error.code === 'ELEVATION_REQUIRED') setElevating(true);
          else showToast(`${m.SAVE_FAILED()}: ${error.message}`);
        },
        onSettled: () => setConfirming(false),
      },
    );

  const targetLabel = (mask: number) =>
    targets.length > 1
      ? targetIndexes(mask)
          .map((i) => targets.find((t) => t.index === i)?.label ?? `${i + 1}`)
          .join(', ')
      : undefined;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-xl">
        <SheetHeader className="pr-12">
          <SheetTitle className="text-lg">{m.SCHEDULE()}</SheetTitle>
          <SheetDescription>
            {name} · {m.SCHEDULE_HINT()}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-3 px-4 pb-24">
          {!canEdit && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
              <span className="flex-1">{m.ELEVATE_HINT()}</span>
              {userLevel === 'admin' && (
                <Button size="sm" variant="outline" onClick={() => setElevating(true)}>
                  {m.ELEVATE()}
                </Button>
              )}
            </div>
          )}
          {!isPending && description && entries.length === 0 && (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{m.WP_EMPTY()}</p>
          )}
          <ul className="flex flex-col gap-2" aria-label={m.SCHEDULE()}>
            {entries.map((entry) => (
              <li key={entry.number}>
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => setEditing(entry)}
                  className={cn(
                    'press flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left hover:bg-accent disabled:cursor-default disabled:hover:bg-card',
                    drafts[entry.number] !== undefined && 'border-blue-500/50',
                  )}
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground [&_svg]:size-5">
                    <TimeIcon entry={entry} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-lg leading-tight font-semibold tabular-nums">{timeText(entry)}</span>
                    <span className="truncate text-[13px] text-muted-foreground">
                      {formatDays(entry.weekdays)}
                      {targetLabel(entry.targets) ? ` · ${targetLabel(entry.targets)}` : ''}
                    </span>
                  </span>
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2.5 py-1 text-xs font-medium',
                      entry.level > 0 ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {levelText(kind, entry.level)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {canEdit && description && (
            <Button type="button" variant="outline" className="justify-center border-dashed" onClick={addEntry}>
              <PlusIcon />
              {m.ADD_SWITCHING_POINT()}
            </Button>
          )}
        </div>
        {canEdit && changeCount > 0 && (
          <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t bg-background/90 p-3 backdrop-blur-md">
            <span className="mr-auto text-sm text-muted-foreground">
              {editedCount === 1 ? m.CHANGES_ONE() : m.CHANGES_COUNT({ count: editedCount })}
            </span>
            <Button variant="outline" onClick={() => setDrafts({})}>
              {m.RESET()}
            </Button>
            <Button onClick={() => setConfirming(true)}>{m.SAVE()}</Button>
          </div>
        )}
        {editing && (
          <EntryDialog
            entry={editing}
            kind={kind}
            targets={targets}
            hasLevel2={hasLevel2}
            onCancel={() => setEditing(null)}
            onDelete={() => {
              setDrafts((d) => ({ ...d, [editing.number]: null }));
              setEditing(null);
            }}
            onSave={(entry) => {
              setDrafts((d) => ({ ...d, [entry.number]: entry }));
              setEditing(null);
            }}
          />
        )}
        {confirming && (
          <ConfirmDialog
            title={m.SAVE_CHANGES()}
            confirmLabel={m.SAVE()}
            busy={putParamset.isPending}
            onConfirm={save}
            onCancel={() => setConfirming(false)}
          >
            <p>{m.WP_SAVE_CONFIRM({ name })}</p>
          </ConfirmDialog>
        )}
        {elevating && <ElevateDialog onDone={() => setElevating(false)} onCancel={() => setElevating(false)} />}
      </SheetContent>
    </Sheet>
  );
};
