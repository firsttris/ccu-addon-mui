import { type ReactNode, useEffect, useId, useState } from 'react';
import MinusIcon from '~icons/lucide/minus';
import PlusIcon from '~icons/lucide/plus';
import UndoIcon from '~icons/lucide/rotate-ccw';
import { type DatapointValue, Operation, type ParameterDescription, type ParamsetDescription } from '../../types/types';
import { getLocale } from '../../paraglide/runtime';
import { m } from '../../paraglide/messages';
import { Switch } from '../../components/ui/switch';
import { Input } from '../../components/ui/input';
import { NativeSelect } from '../../components/ui/select';
import { TimePicker } from '../../components/ui/time-picker';
import { Button } from '../../components/ui/button';
import { cn, formatNumber } from '../../lib/utils';
import { shownParameters } from './ParamsetView';
import { parameterLabel } from './parameters';
import {
  combineSettings,
  controlOf,
  durationLabel,
  enumLabel,
  formatDuration,
  formatTimeOfDay,
  isPercent,
  monthName,
  type Setting,
  stepOf,
  timeOfDayStep,
  unitLabel,
  unitSeconds,
} from './settingKinds';

type OnSet = (name: string, value: string | number | boolean) => void;

const number = (value: number, digits = 2) => formatNumber(value, digits);

// A number for the input field: decimal comma in German, no grouping
const editable = (value: number) => {
  const text = String(Number(value.toFixed(3)));
  return getLocale() === 'de' ? text.replace('.', ',') : text;
};

const roundTo = (value: number, step: number) => {
  const digits = Math.max(0, -Math.floor(Math.log10(step)));
  return Number((Math.round(value / step) * step).toFixed(digits));
};

const clamp = (p: ParameterDescription, value: number) => {
  let next = value;
  if (typeof p.min === 'number') next = Math.max(p.min, next);
  if (typeof p.max === 'number') next = Math.min(p.max, next);
  return p.type === 'INTEGER' ? Math.round(next) : next;
};

const rangeHint = (name: string, p: ParameterDescription) => {
  if (typeof p.min !== 'number' || typeof p.max !== 'number') return undefined;
  if (isPercent(name, p)) return undefined;
  const unit = p.unit && p.unit !== '100%' ? ` ${p.unit}` : '';
  return `${number(p.min)} – ${number(p.max)}${unit}`;
};

// − value + with the unit; typing is checked against the range
const Stepper = ({
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

// 0..100 % with a slider and the exact value next to it
const PercentSlider = ({
  label,
  parameter,
  value,
  onChange,
}: {
  label: string;
  parameter: ParameterDescription;
  value: number | undefined;
  onChange: (value: number) => void;
}) => {
  const scale = parameter.type === 'FLOAT' || parameter.unit === '100%' ? 100 : 1;
  const shown = value === undefined ? 0 : Math.round(value * scale);
  const [draft, setDraft] = useState(shown);
  useEffect(() => setDraft(shown), [shown]);
  const max = typeof parameter.max === 'number' ? Math.round(parameter.max * scale) : 100;
  const min = typeof parameter.min === 'number' ? Math.round(parameter.min * scale) : 0;
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        className="h-2 w-40 cursor-pointer accent-primary"
        aria-label={label}
        aria-valuetext={`${draft} %`}
        min={min}
        max={max}
        step={1}
        value={draft}
        onChange={(event) => setDraft(Number(event.target.value))}
        onPointerUp={() => draft !== shown && onChange(clamp(parameter, draft / scale))}
        onKeyUp={() => draft !== shown && onChange(clamp(parameter, draft / scale))}
        onBlur={() => draft !== shown && onChange(clamp(parameter, draft / scale))}
      />
      <span className="w-12 text-right text-sm tabular-nums">{draft} %</span>
    </div>
  );
};

const Segmented = ({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: number | undefined;
  onChange: (value: number) => void;
}) => (
  <div role="radiogroup" aria-label={label} className="inline-flex w-fit flex-wrap rounded-lg bg-muted p-0.5">
    {options.map((option, index) => (
      <button
        key={option}
        type="button"
        role="radio"
        aria-checked={value === index}
        onClick={() => onChange(index)}
        className={
          value === index
            ? 'h-8 rounded-md bg-background px-3 text-sm font-medium shadow-xs'
            : 'h-8 rounded-md px-3 text-sm text-muted-foreground hover:text-foreground'
        }
      >
        {enumLabel(option)}
      </button>
    ))}
  </div>
);

// One setting as the control its kind needs
const SingleControl = ({
  name,
  label,
  parameter,
  value,
  readOnly,
  onSet,
}: {
  name: string;
  label: string;
  parameter: ParameterDescription;
  value: DatapointValue | undefined;
  readOnly: boolean;
  onSet: OnSet;
}) => {
  const writable = !readOnly && (parameter.operations & Operation.WRITE) !== 0;
  const special = parameter.special?.find((s) => s.value === value);
  const control = special ? 'readonly' : controlOf(name, parameter, writable);
  const num = typeof value === 'number' ? value : undefined;
  switch (control) {
    case 'action':
      return (
        <Button size="sm" variant="outline" type="button" onClick={() => onSet(name, true)}>
          {m.RUN()}
        </Button>
      );
    case 'switch':
      return (
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          {value === true ? m.SETTING_ON() : m.SETTING_OFF()}
          <Switch aria-label={label} checked={value === true} onCheckedChange={(on) => onSet(name, on)} />
        </label>
      );
    case 'segmented':
      return (
        <Segmented
          label={label}
          options={parameter.valueList ?? []}
          value={num}
          onChange={(index) => onSet(name, index)}
        />
      );
    case 'choice':
      return (
        <NativeSelect
          className="h-9 w-auto max-w-[280px] min-w-[160px]"
          aria-label={label}
          value={num ?? ''}
          onChange={(event) => onSet(name, Number(event.target.value))}
        >
          {(parameter.valueList ?? []).map((option, index) =>
            option === 'RESERVED' ? null : (
              <option key={option} value={index}>
                {enumLabel(option)}
              </option>
            ),
          )}
        </NativeSelect>
      );
    case 'percent':
      return <PercentSlider label={label} parameter={parameter} value={num} onChange={(next) => onSet(name, next)} />;
    case 'timeOfDay': {
      // biome-ignore lint/style/noNonNullAssertion: controlOf picks timeOfDay only when there is a step
      const step = timeOfDayStep(name, parameter)!;
      const max = parameter.max as number;
      // DST times in quarter hours, decalcification in half hours (the
      // value then counts half hours)
      const minuteStep = step === 30 ? 30 : max === 1425 ? 15 : 1;
      const factor = step === 30 ? 30 : 1;
      return (
        <TimePicker
          label={label}
          minutes={num === undefined ? undefined : num * factor}
          step={minuteStep}
          max={max * factor}
          onChange={(minutes) => onSet(name, minutes / factor)}
        />
      );
    }
    case 'month':
      return (
        <NativeSelect
          className="h-9 w-40"
          aria-label={label}
          value={num ?? ''}
          onChange={(event) => onSet(name, Number(event.target.value))}
        >
          {Array.from({ length: 12 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: the index is the month
            <option key={i + 1} value={i + 1}>
              {monthName(i + 1)}
            </option>
          ))}
        </NativeSelect>
      );
    case 'stepper':
    case 'number':
      return (
        <Stepper
          label={label}
          parameter={parameter}
          value={num}
          step={stepOf(name, parameter)}
          unit={parameter.unit && parameter.unit !== '100%' ? parameter.unit : undefined}
          onChange={(next) => onSet(name, next)}
          wide={control === 'number'}
        />
      );
    case 'text':
      return (
        <TextControl
          label={label}
          value={typeof value === 'string' ? value : ''}
          onChange={(next) => onSet(name, next)}
        />
      );
    default:
      return <span className="text-sm tabular-nums">{readableValue(name, parameter, value)}</span>;
  }
};

const TextControl = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) => {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <Input
      className="h-9 w-56"
      aria-label={label}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => draft !== value && onChange(draft)}
    />
  );
};

// A value as text in the setting's own terms (percent, time, readable
// choice), for read-only settings and the list of changes
export const readableValue = (
  name: string,
  parameter: ParameterDescription,
  value: DatapointValue | undefined,
): string => {
  if (value === null || value === undefined || value === '') return '–';
  const special = parameter.special?.find((s) => s.value === value);
  if (special) return enumLabel(special.id);
  if (typeof value === 'number') {
    if (parameter.type === 'ENUM') {
      const option = parameter.valueList?.[value];
      return option ? enumLabel(option) : String(value);
    }
    if (isPercent(name, parameter))
      return `${Math.round(value * (parameter.type === 'FLOAT' || parameter.unit === '100%' ? 100 : 1))} %`;
    const step = timeOfDayStep(name, parameter);
    if (step) return formatTimeOfDay(step === 30 ? value * 30 : value);
    if (/_MONTH$/.test(name) && value >= 1 && value <= 12) return monthName(value);
  }
  if (typeof value === 'boolean') return value ? m.SETTING_ON() : m.SETTING_OFF();
  if (typeof value === 'number') {
    const unit = parameter.unit && parameter.unit !== '100%' ? ` ${parameter.unit}` : '';
    return `${number(value)}${unit}`;
  }
  return String(value);
};

// Value and unit of a time side by side, with the resulting duration
const DurationControl = ({
  setting,
  label,
  values,
  readOnly,
  onSet,
}: {
  setting: Extract<Setting, { kind: 'duration' }>;
  label: string;
  values: Record<string, DatapointValue>;
  readOnly: boolean;
  onSet: OnSet;
}) => {
  const value = values[setting.valueName];
  const unitIndex = values[setting.unitName];
  const units = setting.unit.valueList ?? [];
  const unit = typeof unitIndex === 'number' ? units[unitIndex] : undefined;
  const seconds = typeof value === 'number' && unit ? value * (unitSeconds(unit) ?? 0) : undefined;
  const writable =
    !readOnly &&
    (setting.value.operations & Operation.WRITE) !== 0 &&
    (setting.unit.operations & Operation.WRITE) !== 0;
  const total = seconds === undefined ? '' : seconds === 0 ? m.SETTING_DURATION_NONE() : `= ${formatDuration(seconds)}`;
  if (!writable) {
    return (
      <span className="text-sm tabular-nums">
        {typeof value === 'number' && unit ? `${number(value)} × ${unitLabel(unit)}` : '–'}
        {seconds !== undefined && <span className="ml-2 text-muted-foreground">{total}</span>}
      </span>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
      <span className="flex items-center gap-2">
        <Stepper
          label={`${label} (${m.SETTING_COUNT()})`}
          parameter={setting.value}
          value={typeof value === 'number' ? value : undefined}
          step={1}
          onChange={(next) => onSet(setting.valueName, next)}
        />
        <span className="text-sm text-muted-foreground">×</span>
        <NativeSelect
          className="h-9 w-28"
          aria-label={`${label} (${m.SETTING_UNIT()})`}
          value={typeof unitIndex === 'number' ? unitIndex : ''}
          onChange={(event) => onSet(setting.unitName, Number(event.target.value))}
        >
          {units.map((option, index) => (
            <option key={option} value={index}>
              {unitLabel(option)}
            </option>
          ))}
        </NativeSelect>
      </span>
      <span className="min-w-[88px] text-sm text-muted-foreground tabular-nums" aria-live="polite">
        {total}
      </span>
    </div>
  );
};

const Row = ({
  label,
  hint,
  changed,
  onReset,
  children,
}: {
  label: string;
  hint?: string;
  changed: boolean;
  onReset?: () => void;
  children: ReactNode;
}) => {
  const id = useId();
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2.5"
      role="group"
      aria-labelledby={id}
    >
      <div className="flex min-w-[180px] flex-1 flex-col">
        <span id={id} className={cn('flex items-center gap-1.5 text-sm', changed && 'font-semibold')}>
          {label}
          {changed && <span aria-label={m.SETTING_CHANGED()} className="size-1.5 shrink-0 rounded-full bg-blue-600" />}
        </span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      <div className="flex items-center gap-1">
        {children}
        {onReset && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground"
            aria-label={m.SETTING_RESET_DEFAULT({ name: label })}
            title={m.SETTING_RESET_DEFAULT({ name: label })}
            onClick={onReset}
          >
            <UndoIcon className="size-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
};

interface SettingsViewProps {
  label: string;
  description: ParamsetDescription;
  values: Record<string, DatapointValue>;
  onSet: OnSet;
  readOnly?: boolean;
  // Names of parameters with an unsaved change
  changed?: Set<string>;
}

// A channel's settings, each with the control its kind needs: switches,
// choices, sliders for percent, steppers with unit and range, times of day
// and durations as number × unit; a setting off its default can be put
// back to it
export const SettingsView = ({ label, description, values, onSet, readOnly = false, changed }: SettingsViewProps) => {
  const settings = combineSettings(shownParameters(description));
  const isDefault = (p: ParameterDescription, value: DatapointValue | undefined) =>
    p.default === undefined ||
    p.default === null ||
    value === undefined ||
    value === p.default ||
    (typeof p.default === 'number' && typeof value === 'number' && Math.abs(p.default - value) < 1e-6);
  return (
    <div aria-label={label} role="list" className="flex flex-col divide-y">
      {settings.map((setting) => {
        if (setting.kind === 'duration') {
          const rowLabel = durationLabel(setting);
          const offDefault =
            !isDefault(setting.value, values[setting.valueName]) || !isDefault(setting.unit, values[setting.unitName]);
          return (
            <div role="listitem" key={setting.name}>
              <Row
                label={rowLabel}
                changed={!!changed?.has(setting.valueName) || !!changed?.has(setting.unitName)}
                onReset={
                  !readOnly && offDefault
                    ? () => {
                        onSet(setting.valueName, setting.value.default as number);
                        onSet(setting.unitName, setting.unit.default as number);
                      }
                    : undefined
                }
              >
                <DurationControl setting={setting} label={rowLabel} values={values} readOnly={readOnly} onSet={onSet} />
              </Row>
            </div>
          );
        }
        const { name, parameter } = setting;
        const rowLabel = parameterLabel(name);
        const writable = !readOnly && (parameter.operations & Operation.WRITE) !== 0;
        const control = controlOf(name, parameter, writable);
        const hint = control === 'stepper' || control === 'number' ? rangeHint(name, parameter) : undefined;
        return (
          <div role="listitem" key={name}>
            <Row
              label={rowLabel}
              hint={hint}
              changed={!!changed?.has(name)}
              onReset={
                writable && parameter.type !== 'ACTION' && !isDefault(parameter, values[name])
                  ? () => onSet(name, parameter.default as string | number | boolean)
                  : undefined
              }
            >
              <SingleControl
                name={name}
                label={rowLabel}
                parameter={parameter}
                value={values[name]}
                readOnly={readOnly}
                onSet={onSet}
              />
            </Row>
          </div>
        );
      })}
    </div>
  );
};
