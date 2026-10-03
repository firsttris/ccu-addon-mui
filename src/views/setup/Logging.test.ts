import { describe, expect, it } from 'vitest';
import { validLogHost } from './Logging';

describe('validLogHost', () => {
  it('accepts host names and addresses, nothing else', () => {
    expect(validLogHost('')).toBe(true);
    expect(validLogHost('192.168.0.10')).toBe(true);
    expect(validLogHost('log.example.com')).toBe(true);
    expect(validLogHost('fe80::1')).toBe(true);
    expect(validLogHost('a b')).toBe(false);
    expect(validLogHost('x\nLOGLEVEL_RFD=5')).toBe(false);
  });
});
