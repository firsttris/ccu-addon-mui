import { describe, expect, it } from 'vitest';
import { durationText, emptyRule, fromPreset, isValid, presets, summaryOf } from './ruleModel';

const complete = () => ({
  ...emptyRule(),
  name: 'Fenster',
  conditions: [
    {
      channelId: 7101,
      interfaceName: 'HmIP-RF',
      address: '003660C9930AB6:1',
      datapoint: 'STATE',
      op: 'ne' as const,
      value: 0,
    },
  ],
});

describe('isValid', () => {
  it('needs a name and complete conditions', () => {
    expect(isValid(complete())).toBe(true);
    expect(isValid({ ...complete(), name: ' ' })).toBe(false);
    expect(isValid(emptyRule())).toBe(false);
    expect(isValid({ ...complete(), conditions: [] })).toBe(false);
  });

  it('needs both ends of a time window, different', () => {
    expect(isValid({ ...complete(), from: '22:00', to: '06:00' })).toBe(true);
    expect(isValid({ ...complete(), from: '22:00' })).toBe(false);
    expect(isValid({ ...complete(), from: '22:00', to: '22:00' })).toBe(false);
    expect(isValid({ ...complete(), from: '24:00', to: '06:00' })).toBe(false);
  });
});

describe('presets', () => {
  it('fill everything but the channel', () => {
    const door = fromPreset(presets.find((p) => p.key === 'door')!);
    expect(door).toMatchObject({ name: 'Door opened at night', from: '22:00', to: '06:00', minutes: 0 });
    expect(door.conditions[0]).toMatchObject({ datapoint: 'STATE', op: 'ne', value: 0, address: '' });
    expect(isValid(door)).toBe(false);
  });
});

describe('summary', () => {
  it('joins the conditions with duration and window', () => {
    expect(
      summaryOf({ minutes: 15, from: '22:00', to: '06:00' }, [
        'Window: state is open',
        'Outside: temperature less than 10 °C',
      ]),
    ).toBe('Window: state is open and Outside: temperature less than 10 °C · for 15 minutes · 22:00–06:00');
    expect(summaryOf({ minutes: 0 }, ['Water: detected'])).toBe('Water: detected');
  });

  it('writes durations in hours from 60 minutes', () => {
    expect(durationText(45)).toBe('45 minutes');
    expect(durationText(120)).toBe('2 h');
    expect(durationText(90)).toBe('1 h 30 min');
  });
});
