import { ScriptTestButton } from './ScriptTest';
import { useState } from 'react';
import XIcon from '~icons/lucide/x';
import { TimeModuleDialog, useTimeTexts } from './TimeModuleDialog';
import { ProgramCondition, ProgramDestination, TimeModule } from '../../types/protocol';
import { ParameterDescription } from '../../types/types';
import { useSysvars } from '../../queries';
import { Button } from '../../components/ui/button';
import { NativeSelect } from '../../components/ui/select';
import { Input } from '../../components/ui/input';
import { m } from '../../paraglide/messages';
import { cn } from '../../lib/utils';
import {
  ChannelSelect,
  DatapointSelect,
  discreteOptions,
  Field,
  NumberInput,
  SysvarSelect,
  sysvarOptions,
  useDatapoints,
  ValueSelect,
} from './ProgramInputs';
import {
  COMPARE,
  conditionKind,
  ConditionKind,
  describeTimeModule,
  destinationKind,
  DestinationKind,
  newCondition,
  newDestination,
  sysvarValueType,
  TRIGGER,
  valueTypeOf,
} from './programModel';

const selectClass = 'h-9 min-w-0 max-w-full md:text-[13px]';

const RemoveButton = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <Button type="button" size="icon" variant="ghost" aria-label={label} onClick={onClick} className="shrink-0 self-end">
    <XIcon />
  </Button>
);

const Row = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn('flex flex-wrap items-end gap-x-3 gap-y-2 rounded-xl border bg-card p-3', className)}>
    {children}
  </div>
);

// --- Comparisons of numbers (ConditionType 5, 6, 8-11)

const numberCompares = [
  { value: COMPARE.NUMBER_EQUAL, label: () => m.CMP_EQUAL() },
  { value: COMPARE.GREATER, label: () => m.CMP_GREATER() },
  { value: COMPARE.GREATER_EQUAL, label: () => m.CMP_GREATER_EQUAL() },
  { value: COMPARE.LESS, label: () => m.CMP_LESS() },
  { value: COMPARE.LESS_EQUAL, label: () => m.CMP_LESS_EQUAL() },
  { value: COMPARE.RANGE, label: () => m.CMP_RANGE() },
];

const NumberCondition = ({
  condition,
  parameter,
  onChange,
}: {
  condition: ProgramCondition;
  parameter?: Pick<ParameterDescription, 'unit' | 'type'>;
  onChange: (c: ProgramCondition) => void;
}) => {
  const compare = numberCompares.some((c) => c.value === condition.compare) ? condition.compare : COMPARE.NUMBER_EQUAL;
  return (
    <>
      <Field label={m.PRG_COMPARE()}>
        <NativeSelect
          className={selectClass}
          aria-label={m.PRG_COMPARE()}
          value={compare}
          onChange={(e) => onChange({ ...condition, compare: Number(e.target.value) })}
        >
          {numberCompares.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label()}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label={compare === COMPARE.RANGE ? m.RANGE_FROM() : m.PRG_VALUE()}>
        <NumberInput
          label={compare === COMPARE.RANGE ? m.RANGE_FROM() : m.PRG_VALUE()}
          value={condition.value1}
          parameter={parameter}
          onChange={(value1) => onChange({ ...condition, compare, value1 })}
        />
      </Field>
      {compare === COMPARE.RANGE && (
        <Field label={m.RANGE_TO()}>
          <NumberInput
            label={m.RANGE_TO()}
            value={condition.value2}
            parameter={parameter}
            onChange={(value2) => onChange({ ...condition, value2, value2Type: condition.value1Type })}
          />
        </Field>
      )}
    </>
  );
};

// --- Time ("Zeitsteuerung"): a summary, edited in a dialog

const TimeSummary = ({ time, onChange }: { time: TimeModule; onChange: (t: TimeModule) => void }) => {
  const [editing, setEditing] = useState(false);
  const texts = useTimeTexts();
  return (
    <>
      <span className="self-center text-sm">{describeTimeModule(time, texts)}</span>
      <Button type="button" variant="outline" size="sm" className="self-end" onClick={() => setEditing(true)}>
        {m.PRG_TM_EDIT_BUTTON()}
      </Button>
      {editing && (
        <TimeModuleDialog
          time={time}
          onCancel={() => setEditing(false)}
          onSave={(t) => {
            setEditing(false);
            onChange(t);
          }}
        />
      )}
    </>
  );
};

// --- A condition

const kindOptions = (kinds: [string, () => string][]) =>
  kinds.map(([value, label]) => (
    <option key={value} value={value}>
      {label()}
    </option>
  ));

export const ConditionRow = ({
  condition,
  onChange,
  onRemove,
}: {
  condition: ProgramCondition;
  onChange: (c: ProgramCondition) => void;
  onRemove: () => void;
}) => {
  const kind = conditionKind(condition);
  const datapoints = useDatapoints(kind === 'device' ? condition.channel : 0, 'read');
  const parameter = condition.datapoint ? datapoints[condition.datapoint] : undefined;
  const { data: sysvars = [] } = useSysvars();
  const sysvar = kind === 'sysvar' ? sysvars.find((sv) => sv.id === condition.leftValue) : undefined;

  const options =
    kind === 'device' ? discreteOptions(parameter) : kind === 'sysvar' ? sysvarOptions(sysvar) : undefined;
  const isText =
    (kind === 'device' && parameter?.type === 'STRING') || (kind === 'sysvar' && sysvar?.kind === 'string');
  // A datapoint the channel doesn't describe (e.g. no paramset description)
  // keeps its raw value
  const unknownDatapoint = kind === 'device' && !!condition.datapoint && !parameter;
  const isNumber =
    (kind === 'device' && (parameter || unknownDatapoint) && !options && !isText) ||
    (kind === 'sysvar' && sysvar && !options && !isText);
  const triggers =
    kind === 'time'
      ? [
          [TRIGGER.UPDATE, m.PRG_TRIGGER_TIME],
          [TRIGGER.CHECK, m.PRG_TRIGGER_CHECK],
        ]
      : [
          [TRIGGER.CHANGE, m.PRG_TRIGGER_CHANGE],
          [TRIGGER.UPDATE, m.PRG_TRIGGER_UPDATE],
          [TRIGGER.CHECK, m.PRG_TRIGGER_CHECK],
        ];

  return (
    <Row>
      <Field label={m.PRG_KIND()}>
        <NativeSelect
          className={selectClass}
          aria-label={m.PRG_KIND()}
          value={kind}
          disabled={kind === 'other'}
          onChange={(e) => onChange(newCondition(e.target.value as ConditionKind))}
        >
          {kindOptions([
            ['device', m.PRG_KIND_DEVICE],
            ['sysvar', m.PRG_KIND_SYSVAR],
            ['time', m.PRG_KIND_TIME],
          ])}
          {kind === 'other' && <option value="other">{m.PRG_KIND_OTHER()}</option>}
        </NativeSelect>
      </Field>
      {kind === 'device' && (
        <>
          <ChannelSelect
            label={m.CHANNEL()}
            value={condition.channel}
            onChange={(channel) => onChange({ ...condition, channel, datapoint: '', leftValue: 0 })}
          />
          {condition.channel > 0 && (
            <DatapointSelect
              datapoints={datapoints}
              value={condition.datapoint}
              onChange={(name) => {
                const p = datapoints[name];
                const discrete = discreteOptions(p);
                onChange({
                  ...condition,
                  datapoint: name,
                  value1Type: valueTypeOf(p),
                  value1: discrete?.[0]?.value ?? '0',
                  compare: discrete ? COMPARE.EQUAL : COMPARE.NUMBER_EQUAL,
                  // Key presses are updates, not changes
                  trigger: p?.type === 'ACTION' ? TRIGGER.UPDATE : condition.trigger,
                });
              }}
            />
          )}
        </>
      )}
      {kind === 'sysvar' && (
        <SysvarSelect
          value={condition.leftValue}
          onChange={(sv) => {
            const discrete = sysvarOptions(sv);
            onChange({
              ...condition,
              leftValue: sv.id,
              value1Type: sysvarValueType(sv),
              value1: discrete?.[0]?.value ?? (sv.kind === 'string' ? '' : '0'),
              compare: discrete || sv.kind === 'string' ? COMPARE.EQUAL : COMPARE.NUMBER_EQUAL,
            });
          }}
        />
      )}
      {options && (
        <Field label={m.PRG_VALUE()}>
          <ValueSelect
            label={m.PRG_VALUE()}
            value={condition.value1}
            options={options}
            onChange={(value1) => onChange({ ...condition, value1, compare: COMPARE.EQUAL })}
          />
        </Field>
      )}
      {isNumber && <NumberCondition condition={condition} parameter={parameter} onChange={onChange} />}
      {isText && (
        <Field label={m.PRG_VALUE()}>
          <Input
            className="h-9 w-40 md:text-[13px]"
            aria-label={m.PRG_VALUE()}
            value={condition.value1}
            onChange={(e) => onChange({ ...condition, value1: e.target.value, value1Type: 'ivtString' })}
          />
        </Field>
      )}
      {kind === 'time' && condition.time && (
        <TimeSummary time={condition.time} onChange={(time) => onChange({ ...condition, time })} />
      )}
      {kind === 'other' && <span className="self-center text-sm text-muted-foreground">{m.PRG_KIND_OTHER()}</span>}
      {kind !== 'other' && parameter?.type !== 'ACTION' && (
        <Field label={m.PRG_TRIGGER()}>
          <NativeSelect
            className={selectClass}
            aria-label={m.PRG_TRIGGER()}
            value={condition.trigger}
            onChange={(e) => onChange({ ...condition, trigger: Number(e.target.value) })}
          >
            {triggers.map(([value, label]) => (
              <option key={value as number} value={value as number}>
                {(label as () => string)()}
              </option>
            ))}
          </NativeSelect>
        </Field>
      )}
      <span className="flex-1" />
      <RemoveButton label={m.REMOVE_CONDITION()} onClick={onRemove} />
    </Row>
  );
};

// --- An action

const DelayInput = ({ delay, onChange }: { delay: number; onChange: (seconds: number) => void }) => {
  const unit = delay > 0 && delay % 3600 === 0 ? 3600 : delay > 0 && delay % 60 === 0 ? 60 : 1;
  return (
    <>
      <Field label={m.PRG_DELAY()}>
        <NativeSelect
          className={selectClass}
          aria-label={m.PRG_DELAY()}
          value={delay > 0 ? 'delay' : 'now'}
          onChange={(e) => onChange(e.target.value === 'delay' ? 10 : 0)}
        >
          <option value="now">{m.PRG_DELAY_NONE()}</option>
          <option value="delay">{m.PRG_DELAY_AFTER()}</option>
        </NativeSelect>
      </Field>
      {delay > 0 && (
        <span className="flex items-end gap-1.5">
          <NumberInput
            label={m.PRG_DELAY_AFTER()}
            value={String(delay / unit)}
            onChange={(v) => onChange(Math.max(1, Math.min(99 * 3600 + 3599, Math.round(Number(v) * unit))))}
          />
          <NativeSelect
            className="h-9 w-28 md:text-[13px]"
            aria-label={`${m.PRG_DELAY_AFTER()} (${m.TIME_UNIT()})`}
            value={unit}
            onChange={(e) => onChange(Math.max(1, Math.round((delay / unit) * Number(e.target.value))))}
          >
            <option value={1}>{m.PRG_SECONDS()}</option>
            <option value={60}>{m.PRG_MINUTES()}</option>
            <option value={3600}>{m.PRG_HOURS()}</option>
          </NativeSelect>
        </span>
      )}
    </>
  );
};

export const DestinationRow = ({
  destination,
  onChange,
  onRemove,
}: {
  destination: ProgramDestination;
  onChange: (d: ProgramDestination) => void;
  onRemove: () => void;
}) => {
  const kind = destinationKind(destination);
  const datapoints = useDatapoints(kind === 'device' ? destination.channel : 0, 'write');
  const parameter = destination.datapoint ? datapoints[destination.datapoint] : undefined;
  const { data: sysvars = [] } = useSysvars();
  const sysvar = kind === 'sysvar' ? sysvars.find((sv) => sv.id === destination.datapointId) : undefined;
  const options =
    kind === 'device'
      ? parameter?.type === 'ACTION'
        ? [{ value: '1', label: m.RUN() }]
        : discreteOptions(parameter)
      : kind === 'sysvar'
        ? sysvarOptions(sysvar)
        : undefined;
  const isText =
    (kind === 'device' && parameter?.type === 'STRING') || (kind === 'sysvar' && sysvar?.kind === 'string');
  const unknownDatapoint = kind === 'device' && !!destination.datapoint && !parameter;
  // "mit Wert aus": the value of a system variable instead of a fixed one
  const fromSysvar = destination.valueType === 'ivtSystemId';
  const isNumber =
    !fromSysvar &&
    ((kind === 'device' && (parameter || unknownDatapoint)) || (kind === 'sysvar' && sysvar)) &&
    !options &&
    !isText;
  const fixedValue = (): Pick<ProgramDestination, 'valueType' | 'value'> => {
    if (kind === 'sysvar')
      return { valueType: sysvarValueType(sysvar), value: sysvarOptions(sysvar)?.[0]?.value ?? '0' };
    const discrete = parameter?.type === 'ACTION' ? [{ value: '1' }] : discreteOptions(parameter);
    return { valueType: valueTypeOf(parameter), value: discrete?.[0]?.value ?? '0' };
  };
  const canTakeValue = (kind === 'device' && !!destination.datapoint) || (kind === 'sysvar' && !!sysvar);

  return (
    <Row className={kind === 'script' ? 'items-start' : undefined}>
      <Field label={m.PRG_KIND()}>
        <NativeSelect
          className={selectClass}
          aria-label={m.PRG_KIND()}
          value={kind}
          disabled={kind === 'other'}
          onChange={(e) => onChange({ ...newDestination(e.target.value as DestinationKind), delay: destination.delay })}
        >
          {kindOptions([
            ['device', m.PRG_KIND_DEVICE],
            ['sysvar', m.PRG_KIND_SYSVAR],
            ['script', m.PRG_KIND_SCRIPT],
          ])}
          {kind === 'other' && <option value="other">{m.PRG_KIND_OTHER()}</option>}
        </NativeSelect>
      </Field>
      {kind === 'device' && (
        <>
          <ChannelSelect
            label={m.CHANNEL()}
            value={destination.channel}
            onChange={(channel) => onChange({ ...destination, channel, datapoint: '', datapointId: 0 })}
          />
          {destination.channel > 0 && (
            <DatapointSelect
              datapoints={datapoints}
              value={destination.datapoint}
              onChange={(name) => {
                const p = datapoints[name];
                const discrete = p?.type === 'ACTION' ? [{ value: '1' }] : discreteOptions(p);
                onChange({
                  ...destination,
                  datapoint: name,
                  valueType: valueTypeOf(p),
                  value: discrete?.[0]?.value ?? '0',
                });
              }}
            />
          )}
        </>
      )}
      {kind === 'sysvar' && (
        <SysvarSelect
          value={destination.datapointId}
          onChange={(sv) => {
            const discrete = sysvarOptions(sv);
            onChange({
              ...destination,
              datapointId: sv.id,
              valueType: sysvarValueType(sv),
              value: discrete?.[0]?.value ?? (sv.kind === 'string' ? '' : '0'),
            });
          }}
        />
      )}
      {canTakeValue && (
        <Field label={m.PRG_VALUE_FROM()}>
          <NativeSelect
            className={selectClass}
            aria-label={m.PRG_VALUE_FROM()}
            value={fromSysvar ? 'sysvar' : 'fixed'}
            onChange={(e) =>
              onChange({
                ...destination,
                ...(e.target.value === 'sysvar' ? { valueType: 'ivtSystemId', value: '0' } : fixedValue()),
              })
            }
          >
            <option value="fixed">{m.PRG_VALUE_FIXED()}</option>
            <option value="sysvar">{m.PRG_VALUE_OF_SYSVAR()}</option>
          </NativeSelect>
        </Field>
      )}
      {fromSysvar && (
        <SysvarSelect
          value={Number(destination.value)}
          onChange={(sv) => onChange({ ...destination, value: String(sv.id) })}
        />
      )}
      {options && !fromSysvar && (
        <Field label={m.PRG_VALUE()}>
          <ValueSelect
            label={m.PRG_VALUE()}
            value={destination.value}
            options={options}
            onChange={(value) => onChange({ ...destination, value })}
          />
        </Field>
      )}
      {isNumber && (
        <Field label={m.PRG_VALUE()}>
          <NumberInput
            label={m.PRG_VALUE()}
            value={destination.value}
            parameter={parameter}
            onChange={(value) => onChange({ ...destination, value })}
          />
        </Field>
      )}
      {isText && !fromSysvar && (
        <Field label={m.PRG_VALUE()}>
          <Input
            className="h-9 w-40 md:text-[13px]"
            aria-label={m.PRG_VALUE()}
            value={destination.value}
            onChange={(e) => onChange({ ...destination, value: e.target.value, valueType: 'ivtString' })}
          />
        </Field>
      )}
      {kind === 'script' && (
        <label className="flex w-full flex-col gap-1 text-xs">
          <span className="text-muted-foreground">{m.PRG_KIND_SCRIPT()}</span>
          <textarea
            aria-label={m.PRG_KIND_SCRIPT()}
            className="min-h-28 w-full rounded-md border bg-transparent p-2 font-mono text-[13px] text-foreground"
            value={destination.value}
            spellCheck={false}
            onChange={(e) => onChange({ ...destination, value: e.target.value })}
          />
        </label>
      )}
      {kind === 'script' && <ScriptTestButton script={destination.value} />}
      {kind === 'other' && <span className="self-center text-sm text-muted-foreground">{m.PRG_KIND_OTHER()}</span>}
      <DelayInput delay={destination.delay} onChange={(delay) => onChange({ ...destination, delay })} />
      <span className="flex-1" />
      <RemoveButton label={m.REMOVE_ACTION()} onClick={onRemove} />
    </Row>
  );
};
