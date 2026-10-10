import { describe, expect, it } from 'vitest';
import { KEY_FORBIDDEN, gatewayErrors } from './LanGateways';

describe('LAN gateway checks', () => {
  const g = {
    class: 'RF' as const,
    type: 'HMLGW2' as const,
    name: 'Keller',
    serial: 'NEQ0987654',
    key: 'geheim',
    ip: '192.168.178.40',
  };
  it('accepts a valid gateway', () => {
    expect(gatewayErrors(g, [])).toEqual({});
    expect(gatewayErrors({ ...g, ip: '', name: '' }, [])).toEqual({});
  });
  it('finds wrong values', () => {
    expect(gatewayErrors({ ...g, serial: 'neq 1' }, [])).toEqual({ serial: true });
    expect(gatewayErrors(g, [g])).toEqual({ serial: true });
    expect(gatewayErrors({ ...g, key: '' }, [])).toEqual({ key: true });
    expect(gatewayErrors({ ...g, key: 'a\n[Interface 2]' }, [])).toEqual({ key: true });
    expect(gatewayErrors({ ...g, ip: '192.168.178' }, [])).toEqual({ ip: true });
  });
  it('rejects the characters the WebUI forbids in a new key', () => {
    expect(KEY_FORBIDDEN.test('neu#1')).toBe(true);
    expect(KEY_FORBIDDEN.test('a{b')).toBe(true);
    expect(KEY_FORBIDDEN.test('NeuerKey_2')).toBe(false);
  });
});
