import { useMemo, useState } from 'react';
import TrashIcon from '~icons/lucide/trash-2';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { NativeSelect } from '../../components/ui/select';
import { dayName } from '../../lib/format';
import { cn } from '../../lib/utils';
import { m } from '../../paraglide/messages';
import { LevelBar } from '../light/LevelBar';
import {
  ALL_DAYS,
  DAYS,
  type TargetChannel,
  WEEKEND,
  type WeekProgramEntry,
  type WeekProgramKind,
  WORKDAYS,
} from './weekProgram';
import { isSpecial, levelText } from './weekProgramText';

// Editing one switching point

const segment = 'press flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors';

type Field = { draft: WeekProgramEntry; set: (patch: Partial<WeekProgramEntry>) => void };

// The days, one by one or as a group
const DaysField = ({ draft, set }: Field) => (
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
);

// A fixed time, sunrise or sunset with an offset, or a combination
const TimeField = ({ draft, set }: Field) => {
  const mode =
    draft.condition === 1
      ? draft.astroType === 0
        ? 'sunrise'
        : 'sunset'
      : draft.condition === 0
        ? 'fixed'
        : 'combined';
  const minutes = useMemo(() => {
    const steps = Array.from({ length: 12 }, (_, i) => i * 5);
    return steps.includes(draft.minute) ? steps : [...steps, draft.minute].sort((a, b) => a - b);
  }, [draft.minute]);
  return (
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
          // biome-ignore lint/a11y/useSemanticElements: a segmented switch: buttons with role radio and aria-checked; native radios would change its look
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={mode === key}
            onClick={() => set(patch)}
            className={cn(
              segment,
              mode === key ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === 'combined' && <p className="text-xs text-muted-foreground">{m.WP_COMBINED_HINT()}</p>}
      {(mode === 'fixed' || mode === 'combined') && (
        <div className="flex items-center gap-2">
          <NativeSelect
            aria-label={m.HOUR()}
            value={draft.hour}
            onChange={(e) => set({ hour: Number(e.target.value) })}
            className="w-20"
          >
            {Array.from({ length: 24 }, (_, h) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: the index is the hour
              <option key={h} value={h}>
                {String(h).padStart(2, '0')}
              </option>
            ))}
          </NativeSelect>
          <span className="text-lg font-semibold">:</span>
          <NativeSelect
            aria-label={m.MINUTE()}
            value={draft.minute}
            onChange={(e) => set({ minute: Number(e.target.value) })}
            className="w-20"
          >
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
          <NativeSelect
            value={draft.astroOffset}
            onChange={(e) => set({ astroOffset: Number(e.target.value) })}
            className="w-32"
          >
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
  );
};

// On or off, or a level (and the slats of venetian blinds)
const ActionField = ({ draft, set, kind, hasLevel2 }: Field & { kind: WeekProgramKind; hasLevel2: boolean }) => (
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
          // biome-ignore lint/a11y/useSemanticElements: a segmented switch: buttons with role radio and aria-checked; native radios would change its look
          <button
            key={level}
            type="button"
            role="radio"
            aria-checked={draft.level === level}
            onClick={() => set({ level })}
            className={cn(
              segment,
              draft.level === level ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
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
);

// Which of the device's channels the point switches
const TargetsField = ({ draft, set, targets }: Field & { targets: TargetChannel[] }) => (
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
);

// The days, time, action and target channels of one switching point
export const EntryDialog = ({
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
  const valid = draft.weekdays !== 0 && (targets.length === 0 || draft.targets !== 0);

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent aria-label={m.SWITCHING_POINT()} className="max-h-[calc(100vh-32px)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{m.SWITCHING_POINT()}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-5">
          <DaysField draft={draft} set={set} />

          <TimeField draft={draft} set={set} />

          <ActionField draft={draft} set={set} kind={kind} hasLevel2={hasLevel2} />

          {targets.length > 1 && <TargetsField draft={draft} set={set} targets={targets} />}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={onDelete}
            >
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
