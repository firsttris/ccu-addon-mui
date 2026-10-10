import { getLocale } from '../paraglide/runtime';
import { formatNumber } from './utils';

// Two digits, as in clock times: 7 → "07"
export const pad2 = (n: number) => String(n).padStart(2, '0');

// A weekday's name in the app's language; 0 is Monday (2024-01-01 was one)
export const dayName = (index: number, style: 'short' | 'long') =>
  new Intl.DateTimeFormat(getLocale(), { weekday: style }).format(new Date(2024, 0, 1 + index));

// A temperature with one decimal, as the thermostats show it
export const formatTemperature = (value: number) => formatNumber(value, 1, 1);
