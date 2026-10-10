import { type ReactNode, useId } from 'react';
import UndoIcon from '~icons/lucide/rotate-ccw';
import { type DatapointValue, Operation, type ParameterDescription, type ParamsetDescription } from '../../types/types';
import { m } from '../../paraglide/messages';
import { Switch } from '../../components/ui/switch';
import { NativeSelect } from '../../components/ui/select';
import { TimePicker } from '../../components/ui/time-picker';
import { Button } from '../../components/ui/button';
import { cn } from '../../lib/utils';
import { shownParameters } from './ParamsetView';
import { parameterLabel } from './parameters';
import { combineSettings, controlOf, durationLabel, enumLabel, monthName, stepOf, timeOfDayStep } from './settingKinds';
import { type OnSet, rangeHint, readableValue } from './settingValues';
import { Stepper } from './inputs/Stepper';
import { PercentSlider } from './inputs/PercentSlider';
import { Segmented } from './inputs/Segmented';
import { TextControl } from './inputs/TextControl';
import { DurationControl } from './inputs/DurationControl';

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
    // biome-ignore lint/a11y/useSemanticElements: a fieldset brings its own border and spacing
    <div
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2.5"
      role="group"
      aria-labelledby={id}
    >
      <div className="flex min-w-[180px] flex-1 flex-col">
        <span id={id} className={cn('flex items-center gap-1.5 text-sm', changed && 'font-semibold')}>
          {label}
          {changed && (
            <span role="img" aria-label={m.SETTING_CHANGED()} className="size-1.5 shrink-0 rounded-full bg-blue-600" />
          )}
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
    // biome-ignore lint/a11y/useSemanticElements: Safari drops the list role of a ul without bullets; the role says it explicitly
    <div aria-label={label} role="list" className="flex flex-col divide-y">
      {settings.map((setting) => {
        if (setting.kind === 'duration') {
          const rowLabel = durationLabel(setting);
          const offDefault =
            !isDefault(setting.value, values[setting.valueName]) || !isDefault(setting.unit, values[setting.unitName]);
          return (
            // biome-ignore lint/a11y/useSemanticElements: see the list role above
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
          // biome-ignore lint/a11y/useSemanticElements: see the list role above
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
