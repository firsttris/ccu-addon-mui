import { describe, expect, it } from 'vitest';
import { isDefaultName } from './VirtualKeys';

const key = (name: string, address = 'BidCoS-RF:2') => ({ id: 1, address, interfaceName: 'BidCos-RF', name, programs: 0 });

describe('VirtualKeys', () => {
  it('tells the names the CCU gave', () => {
    expect(isDefaultName(key('HM-RCV-50 BidCoS-RF:2'))).toBe(true);
    expect(isDefaultName(key('HmIP-RCV-50 HmIP-RCV-1:5', 'HmIP-RCV-1:5'))).toBe(true);
    expect(isDefaultName(key('BidCoS-RF:2'))).toBe(true);
    expect(isDefaultName(key('Alles aus'))).toBe(false);
  });
});
