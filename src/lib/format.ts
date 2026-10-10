import { getLocale } from '../paraglide/runtime';

// Making an Intl format is slow (it loads the locale's data), so one is
// kept per language and options
const formats = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat>();

const kept = <F extends Intl.NumberFormat | Intl.DateTimeFormat>(
  kind: string,
  options: object,
  make: (locale: string) => F,
): F => {
  const locale = getLocale();
  const key = `${kind}|${locale}|${JSON.stringify(options)}`;
  let format = formats.get(key);
  if (!format) {
    format = make(locale);
    formats.set(key, format);
  }
  return format as F;
};

// A number format in the app's language, e.g. for a currency
export const numberFormat = (options: Intl.NumberFormatOptions) =>
  kept('number', options, (locale) => new Intl.NumberFormat(locale, options));

// A number in the app's language, with at most max and at least min decimals
export const formatNumber = (value: number, max: number, min = 0) =>
  numberFormat({ minimumFractionDigits: min, maximumFractionDigits: max }).format(value);

// A date, a time or both in the app's language
export const formatDate = (date: Date | number, options: Intl.DateTimeFormatOptions) =>
  kept('date', options, (locale) => new Intl.DateTimeFormat(locale, options)).format(date);

// Two digits, as in clock times: 7 → "07"
export const pad2 = (n: number) => String(n).padStart(2, '0');

// A weekday's name in the app's language; 0 is Monday (2024-01-01 was one)
export const dayName = (index: number, style: 'short' | 'long') =>
  formatDate(new Date(2024, 0, 1 + index), { weekday: style });

// A temperature with one decimal, as the thermostats show it
export const formatTemperature = (value: number) => formatNumber(value, 1, 1);
