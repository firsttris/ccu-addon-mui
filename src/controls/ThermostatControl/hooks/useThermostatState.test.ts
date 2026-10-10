import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Channel } from '../../../types/types';

const setDataPoint = vi.fn();
vi.mock('../../../queries', () => ({ useSetDataPoint: () => setDataPoint }));

const { useThermostatState } = await import('./useThermostatState');

const channel = { address: 'A:1', interfaceName: 'HmIP-RF' } as Channel;

describe('useThermostatState', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows a value from the CCU that came in while the user turned the dial', () => {
    const { result, rerender } = renderHook(
      ({ target }) => useThermostatState({ targetTemperature: target, channel }),
      {
        initialProps: { target: 20 },
      },
    );
    act(() => result.current.increaseTemperature());
    expect(result.current.localTarget).toBe(20.5);

    // Sent, optimistic, refused: the value is taken back right away
    act(() => vi.advanceTimersByTime(500));
    expect(setDataPoint).toHaveBeenCalledWith('HmIP-RF', 'A:1', 'SET_POINT_TEMPERATURE', 20.5);
    rerender({ target: 20.5 });
    rerender({ target: 20 });
    expect(result.current.localTarget).toBe(20.5);
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current.localTarget).toBe(20);
  });

  it('keeps waiting while the user goes on', () => {
    const { result, rerender } = renderHook(
      ({ target }) => useThermostatState({ targetTemperature: target, channel }),
      {
        initialProps: { target: 20 },
      },
    );
    act(() => result.current.updateLocalTarget(22));
    rerender({ target: 21 });
    act(() => vi.advanceTimersByTime(2000));
    act(() => result.current.updateLocalTarget(23));
    act(() => vi.advanceTimersByTime(1500));
    expect(result.current.localTarget).toBe(23);
    act(() => vi.advanceTimersByTime(1500));
    expect(result.current.localTarget).toBe(21);
  });
});
