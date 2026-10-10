import type { DatapointValue, ParameterDescription } from '../../types/types';
import { getLocale } from '../../paraglide/runtime';
import { m } from '../../paraglide/messages';
import { enumLabel, formatTimeOfDay, isPercentSetting, monthName, number, timeOfDayStep } from './settingKinds';

export type OnSet = (name: string, value: string | number | boolean) => void;

// A number for the input field: decimal comma in German, no grouping
export const editable = (value: number) => {
  const text = String(Number(value.toFixed(3)));
  return getLocale() === 'de' ? text.replace('.', ',') : text;
};

export const roundTo = (value: number, step: number) => {
  const digits = Math.max(0, -Math.floor(Math.log10(step)));
  return Number((Math.round(value / step) * step).toFixed(digits));
};

export const clamp = (p: ParameterDescription, value: number) => {
  let next = value;
  if (typeof p.min === 'number') next = Math.max(p.min, next);
  if (typeof p.max === 'number') next = Math.min(p.max, next);
  return p.type === 'INTEGER' ? Math.round(next) : next;
};

export const rangeHint = (name: string, p: ParameterDescription) => {
  if (typeof p.min !== 'number' || typeof p.max !== 'number') return undefined;
  if (isPercentSetting(name, p)) return undefined;
  const unit = p.unit && p.unit !== '100%' ? ` ${p.unit}` : '';
  return `${number(p.min)} – ${number(p.max)}${unit}`;
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
    if (isPercentSetting(name, parameter))
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
