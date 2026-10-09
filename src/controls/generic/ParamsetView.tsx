import { useEffect, useState } from 'react';
import {
  DatapointValue,
  Operation,
  ParameterDescription,
  ParameterFlag,
  ParamsetDescription,
} from '../../types/types';
import { defaultLang, TranslationKey, useTranslations } from '../../i18n/utils';
import { m } from '../../paraglide/messages';
import { Switch } from '../../components/ui/switch';
import { Input } from '../../components/ui/input';
import { NativeSelect } from '../../components/ui/select';
import { Button } from '../../components/ui/button';
import { parameterLabel } from './parameters';

// Renders a channel's parameters from its paramset description: the element
// follows the parameter's type, writable parameters get inputs.

const numberFormat = new Intl.NumberFormat(defaultLang, { maximumFractionDigits: 2 });

// HomeMatic gives levels as 0..1 with the unit "100%"
const isPercent = (p: ParameterDescription) => p.unit === '100%';

const toDisplay = (p: ParameterDescription, value: number) => (isPercent(p) ? value * 100 : value);
const fromDisplay = (p: ParameterDescription, value: number) => (isPercent(p) ? value / 100 : value);
const unitOf = (p: ParameterDescription) => (isPercent(p) ? '%' : p.unit ?? '');

// Parameters worth showing: visible, not internal, and either readable or
// an action. Write-only modifiers (ON_TIME, RAMP_TIME) are left out.
export const shownParameters = (description: ParamsetDescription) =>
  Object.entries(description)
    .filter(
      ([, p]) =>
        (p.flags & ParameterFlag.VISIBLE) !== 0 &&
        (p.flags & ParameterFlag.INTERNAL) === 0 &&
        (p.type === 'ACTION'
          ? (p.operations & Operation.WRITE) !== 0
          : (p.operations & (Operation.READ | Operation.EVENT)) !== 0),
    )
    .sort(([a, pa], [b, pb]) => pa.tabOrder - pb.tabOrder || a.localeCompare(b));

// A value as text, e.g. for the list of changes before saving
export const formatParameterValue = (
  parameter: ParameterDescription,
  value: DatapointValue | undefined,
): string => {
  if (value === null || value === undefined || value === '') {
    return '–';
  }
  const special = parameter.special?.find((s) => s.value === value);
  if (special) {
    return special.id;
  }
  switch (parameter.type) {
    case 'BOOL':
    case 'ACTION':
      return value ? m.YES() : m.NO();
    case 'ENUM':
      return typeof value === 'number' ? parameter.valueList?.[value] ?? String(value) : String(value);
    case 'FLOAT':
    case 'INTEGER':
      return typeof value === 'number'
        ? `${numberFormat.format(toDisplay(parameter, value))} ${unitOf(parameter)}`.trim()
        : String(value);
  }
  return String(value);
};

interface ParameterProps {
  name: string;
  // Accessible name of the input
  label: string;
  parameter: ParameterDescription;
  value: DatapointValue | undefined;
  onSet: (name: string, value: string | number | boolean) => void;
  readOnly?: boolean;
  // Readable name of a choice of an ENUM
  optionOf?: (name: string, index: number, option: string) => string;
}

const NumberParameter = ({ name, label, parameter, value, onSet }: ParameterProps) => {
  const shown = typeof value === 'number' ? toDisplay(parameter, value) : undefined;
  const [draft, setDraft] = useState(shown?.toString() ?? '');
  useEffect(() => setDraft(shown?.toString() ?? ''), [shown]);

  const commit = () => {
    const number = Number(draft.replace(',', '.'));
    if (draft === '' || Number.isNaN(number) || number === shown) {
      setDraft(shown?.toString() ?? '');
      return;
    }
    let next = fromDisplay(parameter, number);
    if (typeof parameter.min === 'number') next = Math.max(parameter.min, next);
    if (typeof parameter.max === 'number') next = Math.min(parameter.max, next);
    onSet(name, parameter.type === 'INTEGER' ? Math.round(next) : next);
  };

  return (
    <>
      <Input
        className="h-8 w-24 text-right tabular-nums md:text-[13px]"
        aria-label={label}
        inputMode="decimal"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            commit();
          }
        }}
      />
      {unitOf(parameter) && <span className="ml-1.5 text-muted-foreground">{unitOf(parameter)}</span>}
    </>
  );
};

export const ParameterValue = (props: ParameterProps) => {
  const { name, label, parameter, value, onSet, readOnly } = props;
  const writable = !readOnly && (parameter.operations & Operation.WRITE) !== 0;

  // A value with its own meaning, e.g. "not used"
  const special = parameter.special?.find((s) => s.value === value);

  switch (parameter.type) {
    case 'ACTION':
      if (!writable) {
        return <>–</>;
      }
      return (
        <Button size="sm" variant="outline" type="button" onClick={() => onSet(name, true)}>
          {m.RUN()}
        </Button>
      );
    case 'BOOL':
      if (writable) {
        return (
          <Switch aria-label={label} checked={value === true} onCheckedChange={() => onSet(name, value !== true)} />
        );
      }
      return <>{value === null || value === undefined ? '–' : value ? m.YES() : m.NO()}</>;
    case 'ENUM': {
      const options = parameter.valueList ?? [];
      if (writable) {
        return (
          <NativeSelect
            className="h-8 max-w-[180px] md:text-[13px]"
            aria-label={label}
            value={typeof value === 'number' ? value : ''}
            onChange={(event) => onSet(name, Number(event.target.value))}
          >
            {options.map((option, index) => (
              <option key={option} value={index}>
                {props.optionOf ? props.optionOf(name, index, option) : option}
              </option>
            ))}
          </NativeSelect>
        );
      }
      return (
        <>
          {typeof value === 'number' && options[value] !== undefined
            ? props.optionOf
              ? props.optionOf(name, value, options[value])
              : options[value]
            : (value ?? '–')}
        </>
      );
    }
    case 'FLOAT':
    case 'INTEGER':
      if (special) {
        return <>{special.id}</>;
      }
      if (writable) {
        return <NumberParameter {...props} />;
      }
      return (
        <>
          {typeof value === 'number'
            ? `${numberFormat.format(toDisplay(parameter, value))} ${unitOf(parameter)}`.trim()
            : '–'}
        </>
      );
    default:
      return <>{value === null || value === undefined || value === '' ? '–' : String(value)}</>;
  }
};

interface ParamsetViewProps {
  label: string;
  description: ParamsetDescription;
  values: Record<string, DatapointValue>;
  onSet: (name: string, value: string | number | boolean) => void;
  // Show values only, e.g. settings for users who may not change them
  readOnly?: boolean;
  // Names of parameters with an unsaved change, highlighted
  changed?: Set<string>;
  // Readable names (device settings) instead of the technical ones
  readable?: boolean;
  // Own readable names and choices (link parameters)
  nameOf?: (name: string) => string;
  optionOf?: (name: string, index: number, option: string) => string;
}

export const ParamsetView = ({
  label,
  description,
  values,
  onSet,
  readOnly,
  changed,
  readable,
  nameOf: ownNameOf,
  optionOf,
}: ParamsetViewProps) => {
  const t = useTranslations();
  const named = readable || !!ownNameOf;
  const nameOf = (name: string) =>
    ownNameOf ? ownNameOf(name) : readable ? parameterLabel(name) : t(name as TranslationKey);
  return (
    <dl aria-label={label} className="m-0 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 text-[13px]">
      {shownParameters(description).map(([name, parameter]) => (
        <div key={name} style={{ display: 'contents' }}>
          <dt
            className={`flex min-w-0 items-center gap-1.5 text-muted-foreground ${changed?.has(name) ? 'font-semibold text-foreground' : ''}`}
            title={name}
          >
            <span className={named ? 'min-w-0' : 'truncate'}>{nameOf(name)}</span>
            {changed?.has(name) && <span aria-label="•" className="size-1.5 shrink-0 rounded-full bg-blue-600" />}
          </dt>
          <dd className="m-0 flex items-center justify-end text-right tabular-nums">
            <ParameterValue
              name={name}
              label={named ? nameOf(name) : name}
              parameter={parameter}
              value={values[name]}
              onSet={onSet}
              readOnly={readOnly}
              optionOf={optionOf}
            />
          </dd>
        </div>
      ))}
    </dl>
  );
};
