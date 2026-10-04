import { describe, expect, it } from 'vitest';
import { formatUptime, isNewerVersion } from './SystemInfo';

describe('isNewerVersion', () => {
  it('compares the numbers of firmware versions', () => {
    expect(isNewerVersion('3.89.11.20260919', '3.89.10.20260801')).toBe(true);
    expect(isNewerVersion('3.89.11', '3.89.11')).toBe(false);
    expect(isNewerVersion('3.89.11.20260919', '3.89.11')).toBe(true);
    expect(isNewerVersion('3.79.6', '3.83.6')).toBe(false);
    expect(isNewerVersion('3.100.0', '3.99.9')).toBe(true);
  });
});

describe('formatUptime', () => {
  it('counts days, hours and minutes as help.cgi', () => {
    expect(formatUptime(93784)).toBe('1 d 2 h 3 min');
    expect(formatUptime(59)).toBe('0 d 0 h 0 min');
  });
});
