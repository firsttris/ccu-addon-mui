import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { getLocale } from '../paraglide/runtime';

// Joins class names; later Tailwind classes override earlier ones
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Making an Intl.NumberFormat is slow (it loads the locale's data), so one
// is kept per language and number of decimals
const numberFormats = new Map<string, Intl.NumberFormat>();

// A number in the app's language, with at most max and at least min decimals
export const formatNumber = (value: number, max: number, min = 0) => {
  const key = `${getLocale()}|${min}|${max}`;
  let format = numberFormats.get(key);
  if (!format) {
    format = new Intl.NumberFormat(getLocale(), { minimumFractionDigits: min, maximumFractionDigits: max });
    numberFormats.set(key, format);
  }
  return format.format(value);
};
