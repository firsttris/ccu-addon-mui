import { useEffect, useMemo, useState } from 'react';
import ClockIcon from '~icons/lucide/clock';
import PlusIcon from '~icons/lucide/plus';
import SunriseIcon from '~icons/lucide/sunrise';
import SunsetIcon from '~icons/lucide/sunset';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ElevateDialog } from '../../components/ElevateDialog';
import { Button } from '../../components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../../components/ui/sheet';
import { useToast } from '../../contexts/ToastContext';
import { RequestError, useWebSocketContext } from '../../hooks/useWebsocket';
import { cn } from '../../lib/utils';
import { m } from '../../paraglide/messages';
import { useParamset, useParamsetDescription, usePutParamset } from '../../queries';
import { EntryDialog } from './EntryDialog';
import {
  type Drafts,
  draftChanges,
  editedPoints,
  freeNumber,
  newEntry,
  parseWeekProgram,
  type TargetChannel,
  targetIndexes,
  type Values,
  type WeekProgramEntry,
  type WeekProgramKind,
  withDrafts,
} from './weekProgram';
import { formatDays, levelText, timeText } from './weekProgramText';

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

const TimeIcon = ({ entry }: { entry: WeekProgramEntry }) =>
  entry.condition === 1 ? entry.astroType === 0 ? <SunriseIcon /> : <SunsetIcon /> : <ClockIcon />;

// A switching point in the list: time, days, target channels and level
const EntryCard = ({
  entry,
  kind,
  targetLabel,
  edited,
  disabled,
  onEdit,
}: {
  entry: WeekProgramEntry;
  kind: WeekProgramKind;
  targetLabel?: string;
  edited: boolean;
  disabled: boolean;
  onEdit: () => void;
}) => (
  <li>
    <button
      type="button"
      disabled={disabled}
      onClick={onEdit}
      className={cn(
        'press flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left hover:bg-accent disabled:cursor-default disabled:hover:bg-card',
        edited && 'border-blue-500/50',
      )}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground [&_svg]:size-5">
        <TimeIcon entry={entry} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-lg leading-tight font-semibold tabular-nums">{timeText(entry)}</span>
        <span className="truncate text-[13px] text-muted-foreground">
          {formatDays(entry.weekdays)}
          {targetLabel ? ` · ${targetLabel}` : ''}
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
);

// The switching times of an HmIP actuator's own week program, as cards;
// changes are collected and saved together after a confirmation.
export const WeekProgramSheet = ({
  open,
  onOpenChange,
  interfaceName,
  address,
  name,
  kind,
  targets,
}: WeekProgramSheetProps) => {
  const { userLevel, elevated } = useWebSocketContext();
  const { showToast } = useToast();
  const canEdit = userLevel === 'admin' && elevated;
  const { data: description, isPending } = useParamsetDescription(interfaceName, address, 'MASTER', { enabled: open });
  const { data: values } = useParamset(interfaceName, address, 'MASTER', { enabled: open });
  const putParamset = usePutParamset();

  const [drafts, setDrafts] = useState<Drafts>({});
  const [editing, setEditing] = useState<WeekProgramEntry | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [elevating, setElevating] = useState(false);
  useEffect(() => {
    if (open) setDrafts({});
  }, [open]);

  const stored = useMemo(
    () => (description && values ? parseWeekProgram(description, values as Values) : []),
    [description, values],
  );
  const entries = useMemo(() => withDrafts(description ?? {}, stored, drafts), [stored, drafts, description]);
  const changes = useMemo(
    () => (description && values ? draftChanges(description, values as Values, drafts) : {}),
    [drafts, description, values],
  );
  const changeCount = Object.keys(changes).length;
  const editedCount = editedPoints(changes);
  const hasLevel2 = Boolean(description && Object.keys(description).some((n) => n.endsWith('_WP_LEVEL_2')));

  const addEntry = () => {
    if (!description || !values) return;
    const number = freeNumber(description, values as Values, new Set(Object.keys(drafts)));
    if (!number) {
      showToast(m.WP_FULL());
      return;
    }
    setEditing(newEntry(number, targets, hasLevel2));
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
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              {m.WP_EMPTY()}
            </p>
          )}
          <ul className="flex flex-col gap-2" aria-label={m.SCHEDULE()}>
            {entries.map((entry) => (
              <EntryCard
                key={entry.number}
                entry={entry}
                kind={kind}
                targetLabel={targetLabel(entry.targets)}
                edited={drafts[entry.number] !== undefined}
                disabled={!canEdit}
                onEdit={() => setEditing(entry)}
              />
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
