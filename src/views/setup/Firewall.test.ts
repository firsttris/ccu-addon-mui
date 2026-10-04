import { describe, expect, it } from 'vitest';
import { splitList, validFirewallAddress, validPort } from './Firewall';

describe('firewall checks', () => {
  it('splits lists as the WebUI', () => {
    expect(splitList(' 192.168.0.0/16 ;\n10.0.0.1; ')).toEqual(['192.168.0.0/16', '10.0.0.1']);
    expect(splitList('')).toEqual([]);
  });
  it('checks addresses', () => {
    expect(validFirewallAddress('192.168.0.1')).toBe(true);
    expect(validFirewallAddress('192.168.0.0/16')).toBe(true);
    expect(validFirewallAddress('fc00::/7')).toBe(true);
    expect(validFirewallAddress('192.168.0.300')).toBe(false);
    expect(validFirewallAddress('192.168.0.0/33')).toBe(false);
    expect(validFirewallAddress('host')).toBe(false);
  });
  it('checks ports', () => {
    expect(validPort('8080')).toBe(true);
    expect(validPort('0')).toBe(false);
    expect(validPort('70000')).toBe(false);
  });
});
