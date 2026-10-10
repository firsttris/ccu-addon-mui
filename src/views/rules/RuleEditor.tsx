import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import PlusIcon from '~icons/lucide/plus';
import XIcon from '~icons/lucide/x';
import { useWebSocketActions } from '../../hooks/useWebsocket';
import { useToast } from '../../contexts/ToastContext';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { NativeSelect } from '../../components/ui/select';
import {
  ChannelSelect,
  DatapointSelect,
  Field,
  NumberInput,
  ValueSelect,
  discreteOptions,
  useChannelInfo,
  useDatapoints,
} from '../programs/ProgramInputs';
import { datapointLabel } from '../History';
import { enumLabel } from '../../controls/generic/settingKinds';
import { m } from '../../paraglide/messages';
import type { NotificationRule, RuleCondition } from '../../types/protocol';
import { MAX_CONDITIONS, emptyCondition, isValid, opLabel, summaryOf, type Op } from './ruleModel';
import { errorText } from '../../lib/errors';

const selectClass = 'h-9 min-w-0 max-w-full md:text-[13px]';

// One condition: channel, datapoint, comparison and value, with the
// inputs of the program editor. Reports itself in words for the summary.
const ConditionRow = ({
  condition,
  index,
  onChange,
  onRemove,
  onText,
}: {
  condition: RuleCondition;
  index: number;
  onChange: (c: RuleCondition) => void;
  onRemove?: () => void;
  onText: (text: string) => void;
}) => {
  const channel = useChannelInfo(condition.channelId ?? 0);
  const datapoints = useDatapoints(condition.channelId ?? 0, 'read');
  const parameter = condition.datapoint ? datapoints[condition.datapoint] : undefined;
  const options = discreteOptions(parameter)?.map((o) =>
    parameter?.type === 'ENUM' ? { ...o, label: enumLabel(o.label) } : o,
  );
  const discrete = !!options;
  const ops: Op[] = discrete ? ['eq', 'ne'] : ['eq', 'ne', 'lt', 'gt'];
  const value = String(condition.value);

  const text = useMemo(() => {
    if (!channel || !condition.datapoint) return '';
    const shown = options
      ? (options.find((o) => o.value === value)?.label ?? value)
      : parameter?.unit === '100%'
        ? `${Math.round(condition.value * 100)} %`
        : `${condition.value}${parameter?.unit ? ` ${parameter.unit}` : ''}`;
    return `${channel.name}: ${datapointLabel(condition.datapoint)} ${opLabel(condition.op, discrete)} ${shown}`;
  }, [channel, condition, options, parameter, value, discrete]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reports when the text changes; onText is a new function every render
  useEffect(() => onText(text), [text]);

  return (
    <li className="grid grid-cols-2 items-end gap-2 p-2.5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
      <div className="col-span-2 flex items-end gap-2 sm:col-span-3 [&>label]:flex-1">
        <ChannelSelect
          label={m.CHANNEL()}
          value={condition.channelId ?? 0}
          onChange={(channelId) => onChange({ ...condition, channelId, address: '', interfaceName: '' })}
        />
        {onRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9"
            aria-label={m.RULE_REMOVE_CONDITION({ index: index + 1 })}
            onClick={onRemove}
          >
            <XIcon />
          </Button>
        )}
      </div>
      <div className="col-span-2 grid sm:col-span-1">
        <DatapointSelect
          datapoints={datapoints}
          value={condition.datapoint}
          onChange={(datapoint) => {
            const p = datapoints[datapoint];
            const keep = condition.datapoint === datapoint;
            onChange({
              ...condition,
              datapoint,
              op: keep || p?.type !== 'FLOAT' ? condition.op : 'gt',
              value: keep ? condition.value : p?.type === 'BOOL' || p?.type === 'ACTION' ? 1 : 0,
            });
          }}
        />
      </div>
      <Field label={m.PRG_COMPARE()}>
        <NativeSelect
          className={selectClass}
          aria-label={m.PRG_COMPARE()}
          value={ops.includes(condition.op) ? condition.op : 'eq'}
          onChange={(e) => onChange({ ...condition, op: e.target.value as Op })}
        >
          {ops.map((op) => (
            <option key={op} value={op}>
              {opLabel(op, discrete)}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label={m.PRG_VALUE()}>
        {options ? (
          <ValueSelect
            label={m.PRG_VALUE()}
            value={value}
            options={options}
            onChange={(v) => onChange({ ...condition, value: Number(v) })}
          />
        ) : (
          <NumberInput
            label={m.PRG_VALUE()}
            value={value}
            parameter={parameter}
            onChange={(v) => onChange({ ...condition, value: Number(v) })}
          />
        )}
      </Field>
      {channel && (condition.address !== channel.address || condition.interfaceName !== channel.interfaceName) && (
        // The channel's address and interface, once the channel list knows them
        <SyncAddress channel={channel} condition={condition} onChange={onChange} />
      )}
    </li>
  );
};

const SyncAddress = ({
  channel,
  condition,
  onChange,
}: {
  channel: { address: string; interfaceName: string };
  condition: RuleCondition;
  onChange: (c: RuleCondition) => void;
}) => {
  // biome-ignore lint/correctness/useExhaustiveDependencies: only when another channel is picked
  useEffect(() => {
    onChange({ ...condition, address: channel.address, interfaceName: channel.interfaceName });
  }, [channel.address, channel.interfaceName]);
  return null;
};

// Creating or changing a notification rule
export const RuleEditor = ({ rule: initial, onClose }: { rule: NotificationRule; onClose: () => void }) => {
  const { request } = useWebSocketActions();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [rule, setRule] = useState(initial);
  const [texts, setTexts] = useState<string[]>([]);
  const [windowOn, setWindowOn] = useState(!!initial.from);
  const summary = summaryOf(
    rule,
    rule.conditions.map((_, i) => texts[i] ?? ''),
  );
  const shown: NotificationRule = windowOn
    ? { ...rule, from: rule.from || '22:00', to: rule.to || '06:00' }
    : { ...rule, from: undefined, to: undefined };
  const valid = isValid(shown);

  const save = useMutation({
    mutationFn: async () => (await request({ type: 'saveRule', rule: { ...shown, summary } })).rule,
    onSuccess: () => {
      showToast(m.RULE_SAVED(), 'info');
      queryClient.invalidateQueries({ queryKey: ['rules'] });
      onClose();
    },
    onError: (error) => showToast(errorText(error, m.CHANGE_FAILED)),
  });

  const setCondition = (index: number, c: RuleCondition) =>
    setRule((r) => ({ ...r, conditions: r.conditions.map((old, i) => (i === index ? c : old)) }));

  return (
    <ConfirmDialog
      title={initial.id ? m.RULE_EDIT({ name: initial.name }) : m.RULE_NEW()}
      confirmLabel={m.SAVE()}
      busy={!valid || save.isPending}
      onConfirm={() => save.mutate()}
      onCancel={onClose}
      className="sm:max-w-2xl"
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) save.mutate();
        }}
      >
        <Field label={m.NAME()}>
          <Input
            autoFocus
            className="h-9"
            value={rule.name}
            maxLength={100}
            onChange={(e) => setRule({ ...rule, name: e.target.value })}
          />
        </Field>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm text-muted-foreground">{m.RULE_CONDITIONS()}</legend>
          <ul className="flex flex-col divide-y rounded-lg border" aria-label={m.RULE_CONDITIONS()}>
            {rule.conditions.map((condition, i) => (
              <ConditionRow
                // biome-ignore lint/suspicious/noArrayIndexKey: conditions have no id; the rows are controlled
                key={i}
                index={i}
                condition={condition}
                onChange={(c) => setCondition(i, c)}
                onRemove={
                  rule.conditions.length > 1
                    ? () => {
                        setRule((r) => ({ ...r, conditions: r.conditions.filter((_, j) => j !== i) }));
                        setTexts((list) => list.filter((_, j) => j !== i));
                      }
                    : undefined
                }
                onText={(text) => setTexts((list) => Object.assign([...list], { [i]: text }))}
              />
            ))}
          </ul>
          {rule.conditions.length < MAX_CONDITIONS && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => setRule({ ...rule, conditions: [...rule.conditions, emptyCondition()] })}
            >
              <PlusIcon />
              {m.RULE_ADD_CONDITION()}
            </Button>
          )}
          <p className="text-xs text-muted-foreground">{m.RULE_CONDITIONS_HINT()}</p>
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={m.RULE_DURATION()}>
            <span className="flex items-center gap-1.5">
              <Input
                type="number"
                className="h-9 w-24 text-right tabular-nums"
                aria-label={m.RULE_DURATION()}
                min={0}
                max={10080}
                value={rule.minutes}
                onChange={(e) => setRule({ ...rule, minutes: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
              />
              <span className="text-sm text-muted-foreground">{m.RULE_DURATION_UNIT()}</span>
            </span>
          </Field>
          <Field label={m.RULE_WINDOW()}>
            <span className="flex flex-wrap items-center gap-2">
              <NativeSelect
                className="h-9 w-auto"
                aria-label={m.RULE_WINDOW()}
                value={windowOn ? 'on' : 'off'}
                onChange={(e) => setWindowOn(e.target.value === 'on')}
              >
                <option value="off">{m.RULE_WINDOW_ALWAYS()}</option>
                <option value="on">{m.RULE_WINDOW_ONLY()}</option>
              </NativeSelect>
              {windowOn && (
                <>
                  <Input
                    type="time"
                    className="h-9 w-28"
                    aria-label={m.RANGE_FROM()}
                    value={shown.from}
                    onChange={(e) => setRule({ ...rule, from: e.target.value })}
                  />
                  –
                  <Input
                    type="time"
                    className="h-9 w-28"
                    aria-label={m.RANGE_TO()}
                    value={shown.to}
                    onChange={(e) => setRule({ ...rule, to: e.target.value })}
                  />
                </>
              )}
            </span>
          </Field>
        </div>

        <Field label={m.RULE_MESSAGE()}>
          <Input
            className="h-9"
            value={rule.message}
            maxLength={300}
            placeholder={summary}
            onChange={(e) => setRule({ ...rule, message: e.target.value })}
          />
        </Field>
        <p className="text-xs text-muted-foreground">{m.RULE_MESSAGE_HINT()}</p>
      </form>
    </ConfirmDialog>
  );
};
