import styled from '@emotion/styled';
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

// Renders a channel's parameters from its paramset description: the element
// follows the parameter's type, writable parameters get inputs.

const List = styled.dl`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 4px 8px;
  margin: 0;
  font-size: 12px;
`;

const Key = styled.dt`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: ${(props) => props.theme.colors.textSecondary};
`;

const Value = styled.dd`
  margin: 0;
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: ${(props) => props.theme.colors.text};
`;

const Toggle = styled.button<{ checked: boolean }>`
  width: 36px;
  height: 20px;
  padding: 2px;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  background: ${({ checked }) => (checked ? '#43a047' : '#9e9e9e')};
  display: flex;
  justify-content: ${({ checked }) => (checked ? 'flex-end' : 'flex-start')};

  &::after {
    content: '';
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #fff;
  }
`;

const inputStyle = `
  font: inherit;
  font-size: 12px;
  max-width: 110px;
  box-sizing: border-box;
`;

const Select = styled.select`
  ${inputStyle}
`;

const NumberInput = styled.input`
  ${inputStyle}
  width: 80px;
  text-align: right;
`;

const ActionButton = styled.button`
  font: inherit;
  font-size: 12px;
  cursor: pointer;
`;

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
  t: (key: TranslationKey) => string,
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
  parameter: ParameterDescription;
  value: DatapointValue | undefined;
  onSet: (name: string, value: string | number | boolean) => void;
  readOnly?: boolean;
}

const NumberParameter = ({ name, parameter, value, onSet }: ParameterProps) => {
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
      <NumberInput
        aria-label={name}
        inputMode="decimal"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            commit();
          }
        }}
      />{' '}
      {unitOf(parameter)}
    </>
  );
};

const ParameterValue = (props: ParameterProps) => {
  const { name, parameter, value, onSet, readOnly } = props;
  const t = useTranslations();
  const writable = !readOnly && (parameter.operations & Operation.WRITE) !== 0;

  // A value with its own meaning, e.g. "not used"
  const special = parameter.special?.find((s) => s.value === value);

  switch (parameter.type) {
    case 'ACTION':
      if (!writable) {
        return <>–</>;
      }
      return (
        <ActionButton type="button" onClick={() => onSet(name, true)}>
          {m.RUN()}
        </ActionButton>
      );
    case 'BOOL':
      if (writable) {
        return (
          <Toggle
            type="button"
            role="switch"
            aria-label={name}
            aria-checked={value === true}
            checked={value === true}
            onClick={() => onSet(name, value !== true)}
          />
        );
      }
      return <>{value === null || value === undefined ? '–' : value ? m.YES() : m.NO()}</>;
    case 'ENUM': {
      const options = parameter.valueList ?? [];
      if (writable) {
        return (
          <Select
            aria-label={name}
            value={typeof value === 'number' ? value : ''}
            onChange={(event) => onSet(name, Number(event.target.value))}
          >
            {options.map((option, index) => (
              <option key={option} value={index}>
                {option}
              </option>
            ))}
          </Select>
        );
      }
      return <>{typeof value === 'number' ? options[value] ?? value : value ?? '–'}</>;
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
}

export const ParamsetView = ({ label, description, values, onSet, readOnly, changed }: ParamsetViewProps) => {
  const t = useTranslations();
  return (
    <List aria-label={label}>
      {shownParameters(description).map(([name, parameter]) => (
        <div key={name} style={{ display: 'contents' }}>
          <Key title={name} style={changed?.has(name) ? { fontWeight: 700 } : undefined}>
            {t(name as TranslationKey)}
            {changed?.has(name) ? ' •' : ''}
          </Key>
          <Value>
            <ParameterValue name={name} parameter={parameter} value={values[name]} onSet={onSet} readOnly={readOnly} />
          </Value>
        </div>
      ))}
    </List>
  );
};
