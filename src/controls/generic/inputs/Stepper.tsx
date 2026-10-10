import { useEffect, useState } from 'react';
import MinusIcon from '~icons/lucide/minus';
import PlusIcon from '~icons/lucide/plus';
import type { ParameterDescription } from '../../../types/types';
import { cn } from '../../../lib/utils';
import { clamp, editable, roundTo } from '../settingValues';

// − value + with the unit; typing is checked against the range
export const Stepper = ({
  label,
  parameter,
  value,
  step,
  unit,
  onChange,
  wide,
}: {
  label: string;
  parameter: ParameterDescription;
  value: number | undefined;
  step: number;
  unit?: string;
  onChange: (value: number) => void;
  wide?: boolean;
}) => {
  const [draft, setDraft] = useState(value === undefined ? '' : editable(value));
  useEffect(() => setDraft(value === undefined ? '' : editable(value)), [value]);
  const parsed = Number(draft.trim().replace(',', '.'));
  const outOfRange =
    draft !== '' &&
    (Number.isNaN(parsed) ||
      (typeof parameter.min === 'number' && parsed < parameter.min) ||
      (typeof parameter.max === 'number' && parsed > parameter.max));
  const commit = () => {
    if (draft === '' || Number.isNaN(parsed)) {
      setDraft(value === undefined ? '' : editable(value));
      return;
    }
    const next = clamp(parameter, parsed);
    if (next !== value) onChange(next);
    else setDraft(editable(next));
  };
  const nudge = (direction: 1 | -1) =>
    onChange(clamp(parameter, roundTo((value ?? (parameter.min as number) ?? 0) + direction * step, step)));
  const atMin = typeof parameter.min === 'number' && value !== undefined && value <= parameter.min;
  const atMax = typeof parameter.max === 'number' && value !== undefined && value >= parameter.max;
  return (
    <div className="flex items-center gap-1.5">
      <div
        className={cn(
          'flex h-9 items-center overflow-hidden rounded-md border shadow-xs',
          outOfRange && 'border-destructive',
        )}
      >
        <button
          type="button"
          className="flex h-full w-8 items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-40"
          aria-label={`${label} −`}
          disabled={atMin}
          onClick={() => nudge(-1)}
        >
          <MinusIcon className="size-3.5" />
        </button>
        <input
          className={cn(
            'h-full border-x bg-transparent text-center text-sm tabular-nums outline-none focus-visible:bg-muted/50',
            wide ? 'w-24' : 'w-16',
          )}
          aria-label={label}
          aria-invalid={outOfRange}
          inputMode="decimal"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit();
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              nudge(1);
            }
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              nudge(-1);
            }
          }}
        />
        <button
          type="button"
          className="flex h-full w-8 items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-40"
          aria-label={`${label} +`}
          disabled={atMax}
          onClick={() => nudge(1)}
        >
          <PlusIcon className="size-3.5" />
        </button>
      </div>
      {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
    </div>
  );
};
