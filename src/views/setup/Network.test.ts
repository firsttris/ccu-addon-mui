import { describe, expect, it } from 'vitest';
import { networkErrors, validNetmask } from './Network';

describe('network checks', () => {
  const manual = { dhcp: false, hostname: 'ccu', ip: '192.168.1.30', netmask: '255.255.255.0', gateway: '192.168.1.1', dns1: '', dns2: '' };
  it('accepts a valid setup', () => {
    expect(networkErrors(manual)).toEqual({});
    expect(networkErrors({ ...manual, dhcp: true, ip: 'x' })).toEqual({});
  });
  it('finds wrong values', () => {
    expect(networkErrors({ ...manual, hostname: 'ccu keller' })).toEqual({ hostname: true });
    expect(networkErrors({ ...manual, ip: '192.168.1.300' })).toEqual({ ip: true });
    expect(networkErrors({ ...manual, gateway: '10.0.0.1' })).toEqual({ gateway: true });
    expect(networkErrors({ ...manual, dns1: 'dns' })).toEqual({ dns1: true });
  });
  it('checks netmasks', () => {
    expect(validNetmask('255.255.255.0')).toBe(true);
    expect(validNetmask('255.255.0.0')).toBe(true);
    expect(validNetmask('255.255.255.255')).toBe(true);
    expect(validNetmask('255.0.255.0')).toBe(false);
    expect(validNetmask('0.0.0.0')).toBe(false);
  });
});
