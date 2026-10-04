import { describe, expect, it } from 'vitest';
// The registry first, as in the app (queries import it, the controls them)
import { controlOverrides } from './registry';
import { WaterSwitchControl, WINMATIC_LOCKED, WinmaticControl, winmaticState } from './WaterControls';
import { groupChannelsByType } from '../hooks/channels';
import { Channel } from '../types/types';

describe('water and window drive tiles', () => {
  it('are registered for their channel types', () => {
    expect(controlOverrides.WATER_SWITCH_VIRTUAL_RECEIVER).toMatchObject({ section: 'water', component: WaterSwitchControl });
    expect(controlOverrides.WINMATIC).toMatchObject({ section: 'windows', component: WinmaticControl });
  });

  // rf_winmatic.xml: LEVEL 0..1, the special value LOCKED is -0.005
  it('reads the Winmatic position', () => {
    expect(winmaticState(WINMATIC_LOCKED)).toBe('locked');
    expect(winmaticState(0)).toBe('closed');
    expect(winmaticState(0.4)).toBe('partly');
    expect(winmaticState(1)).toBe('open');
    expect(winmaticState(undefined)).toBe('unknown');
  });

  it('hides the irrigation valve state channel next to its switchable channel', () => {
    const channel = (type: string, address: string) =>
      ({ id: 1, name: type, address, interfaceName: 'HmIP-RF', type, datapoints: { STATE: false } }) as unknown as Channel;
    const types = groupChannelsByType([channel('WATER_SWITCH_TRANSMITTER', 'A:1'), channel('WATER_SWITCH_VIRTUAL_RECEIVER', 'A:2')]).map(([type]) => type);
    expect(types).toEqual(['WATER_SWITCH_VIRTUAL_RECEIVER']);
  });
});
