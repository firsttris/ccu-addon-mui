import { type DatapointValue, Operation } from '../../../types/types';
import { m } from '../../../paraglide/messages';
import { NativeSelect } from '../../../components/ui/select';
import { formatDuration, number, type Setting, unitLabel, unitSeconds } from '../settingKinds';
import type { OnSet } from '../settingValues';
import { Stepper } from './Stepper';

// Value and unit of a time side by side, with the resulting duration
export const DurationControl = ({
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
