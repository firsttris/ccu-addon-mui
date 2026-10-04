import { ReactNode, useEffect, useMemo, useState } from 'react';
import { useChannelList, useParamsetDescription, useSysvars } from '../../queries';
import { Operation, ParameterDescription, ParameterFlag, ParamsetDescription, Sysvar } from '../../types/types';
import { NativeSelect } from '../../components/ui/select';
import { ChannelField } from '../../components/ChannelField';
import { Input } from '../../components/ui/input';
import { TranslationKey, useTranslations } from '../../i18n/utils';
import { m } from '../../paraglide/messages';

// The inputs of the program editor: channels, datapoints, system variables
// and values as the WebUI's condition and action rows offer them (sico.inc,
// dest.inc).

export const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="flex min-w-0 flex-col gap-1 text-xs">
    <span className="text-muted-foreground">{label}</span>
    {children}
  </label>
);

const selectClass = 'h-9 min-w-0 max-w-full md:text-[13px]';

// A channel of any device, chosen in the channel dialog (pictures, search)
export const ChannelSelect = ({ value, onChange, label }: { value: number; onChange: (id: number) => void; label: string }) => {
  const { data: channels = [] } = useChannelList();
  return (
    <div className="flex min-w-0 flex-col gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <ChannelField label={label} value={value} channels={channels} onChange={onChange} includeHidden />
    </div>
  );
};

// The channel's address and interface, for its paramset description
export const useChannelInfo = (id: number) => {
  const { data: channels = [] } = useChannelList();
  return channels.find((c) => c.id === id);
};

// Datapoints of a channel that can be read (conditions) or written (actions)
export const useDatapoints = (channelId: number, need: 'read' | 'write') => {
  const channel = useChannelInfo(channelId);
  const { data: description } = useParamsetDescription(channel?.interfaceName ?? '', channel?.address ?? '', 'VALUES');
  return useMemo(() => {
    if (!channel || !description) return {} as ParamsetDescription;
    const mask = need === 'read' ? Operation.READ | Operation.EVENT : Operation.WRITE;
    return Object.fromEntries(
      Object.entries(description).filter(
        ([, p]) => (p.operations & mask) !== 0 && (p.flags & ParameterFlag.VISIBLE) !== 0 && (p.flags & ParameterFlag.INTERNAL) === 0,
      ),
    ) as ParamsetDescription;
  }, [channel, description, need]);
};

export const DatapointSelect = ({
  datapoints,
  value,
  onChange,
}: {
  datapoints: ParamsetDescription;
  value?: string;
  onChange: (name: string) => void;
}) => {
  const t = useTranslations();
  const names = Object.keys(datapoints).sort();
  return (
    <Field label={m.PRG_DATAPOINT()}>
      <NativeSelect className={selectClass} aria-label={m.PRG_DATAPOINT()} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">{m.PRG_CHOOSE()}</option>
        {names.map((name) => (
          <option key={name} value={name}>
            {t(name as TranslationKey)}
          </option>
        ))}
        {value && !names.includes(value) && <option value={value}>{value}</option>}
      </NativeSelect>
    </Field>
  );
};

export const SysvarSelect = ({ value, onChange }: { value: number; onChange: (sysvar: Sysvar) => void }) => {
  const { data: sysvars = [] } = useSysvars();
  return (
    <Field label={m.PRG_KIND_SYSVAR()}>
      <NativeSelect
        className={selectClass}
        aria-label={m.PRG_KIND_SYSVAR()}
        value={value || ''}
        onChange={(e) => {
          const sysvar = sysvars.find((sv) => sv.id === Number(e.target.value));
          if (sysvar) onChange(sysvar);
        }}
      >
        <option value="">{m.PRG_CHOOSE()}</option>
        {sysvars.map((sv) => (
          <option key={sv.id} value={sv.id}>
            {sv.name}
          </option>
        ))}
      </NativeSelect>
    </Field>
  );
};

// A number as the user sees it: percent for "100%" datapoints
const isPercent = (p?: Pick<ParameterDescription, 'unit'>) => p?.unit === '100%';

export const NumberInput = ({
  label,
  value,
  parameter,
  onChange,
}: {
  label: string;
  value: string;
  parameter?: Pick<ParameterDescription, 'unit' | 'type'>;
  onChange: (value: string) => void;
}) => {
  const shown = (v: string) => {
    const n = Number(v);
    return Number.isNaN(n) ? '' : String(Math.round((isPercent(parameter) ? n * 100 : n) * 1000) / 1000);
  };
  const [draft, setDraft] = useState(shown(value));
  useEffect(() => setDraft(shown(value)), [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const commit = () => {
    const n = Number(draft.replace(',', '.'));
    if (draft === '' || Number.isNaN(n)) return setDraft(shown(value));
    const stored = isPercent(parameter) ? n / 100 : n;
    onChange(String(parameter?.type === 'INTEGER' ? Math.round(stored) : stored));
  };
  const unit = isPercent(parameter) ? '%' : parameter?.unit;
  return (
    <span className="flex items-center gap-1.5">
      <Input
        className="h-9 w-24 text-right tabular-nums md:text-[13px]"
        aria-label={label}
        inputMode="decimal"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
      {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
    </span>
  );
};

// A discrete value: on/off, an entry of a list, or a key press
export const ValueSelect = ({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) => (
  <NativeSelect className={selectClass} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
    {options.map((o) => (
      <option key={o.value} value={o.value}>
        {o.label}
      </option>
    ))}
    {!options.some((o) => o.value === value) && <option value={value}>{value}</option>}
  </NativeSelect>
);

// The discrete choices of a datapoint, or undefined for numbers and texts
export const discreteOptions = (p?: ParameterDescription) => {
  if (!p) return undefined;
  if (p.type === 'BOOL') return [{ value: '1', label: m.BOOL_TRUE() }, { value: '0', label: m.BOOL_FALSE() }];
  if (p.type === 'ACTION') return [{ value: '1', label: m.KEY_PRESS() }];
  if (p.type === 'ENUM') return (p.valueList ?? []).map((label, index) => ({ value: String(index), label }));
  return undefined;
};

export const sysvarOptions = (sv?: Sysvar) => {
  if (!sv) return undefined;
  if (sv.kind === 'bool' || sv.kind === 'alarm')
    return [
      { value: '1', label: sv.trueName || m.BOOL_TRUE() },
      { value: '0', label: sv.falseName || m.BOOL_FALSE() },
    ];
  if (sv.kind === 'enum') return (sv.valueList ?? []).map((label, index) => ({ value: String(index), label }));
  return undefined;
};
