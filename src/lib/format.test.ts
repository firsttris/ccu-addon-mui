import { describe, expect, it } from 'vitest';
import { getLocale } from '../paraglide/runtime';
import { formatDate, formatNumber, numberFormat } from './format';

describe('format', () => {
  it('keeps one format per language and options', () => {
    expect(numberFormat({ style: 'currency', currency: 'EUR' })).toBe(
      numberFormat({ style: 'currency', currency: 'EUR' }),
    );
    expect(numberFormat({ style: 'currency', currency: 'EUR' })).not.toBe(
      numberFormat({ style: 'currency', currency: 'USD' }),
    );
  });

  it('formats as Intl does in the app language', () => {
    const locale = getLocale();
    expect(formatNumber(1234.567, 2)).toBe(
      new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(1234.567),
    );
    expect(formatNumber(3, 1, 1)).toBe(new Intl.NumberFormat(locale, { minimumFractionDigits: 1 }).format(3));
    const date = new Date(2026, 9, 10, 13, 5);
    expect(formatDate(date, { dateStyle: 'medium' })).toBe(
      new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date),
    );
  });
});
