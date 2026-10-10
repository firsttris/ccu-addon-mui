import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { ToastProvider } from '../contexts/ToastContext';
import { Channel } from '../types/types';

const request = vi.fn();
vi.mock('../hooks/useWebsocket', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../hooks/useWebsocket')>()),
  useWebSocketActions: () => ({ request }),
}));

const { useSetDataPoint } = await import('./index');
const { RequestError } = await import('../hooks/useWebsocket');

const light = {
  id: 1,
  name: 'Licht',
  address: 'A:1',
  interfaceName: 'HmIP-RF',
  type: 'SWITCH_VIRTUAL_RECEIVER',
  datapoints: { STATE: false, LEVEL: 0.2 },
} as Channel;

const setup = () => {
  const queryClient = new QueryClient();
  queryClient.setQueryData(['channels', { roomId: '1' }], [light]);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
  const { result } = renderHook(() => useSetDataPoint(), { wrapper });
  const state = () => (queryClient.getQueryData<Channel[]>(['channels', { roomId: '1' }]) ?? [])[0].datapoints;
  return { queryClient, set: result.current, state };
};

describe('useSetDataPoint', () => {
  it('shows the new value right away', async () => {
    request.mockResolvedValueOnce({ success: true });
    const { set, state } = setup();
    act(() => set('HmIP-RF', 'A:1', 'STATE', true));
    expect(state()).toMatchObject({ STATE: true });
    await vi.waitFor(() => expect(request).toHaveBeenCalled());
    expect(state()).toMatchObject({ STATE: true });
  });

  it('rolls back when the CCU refuses', async () => {
    request.mockRejectedValueOnce(new RequestError('no', 'FORBIDDEN'));
    const { set, state } = setup();
    act(() => set('HmIP-RF', 'A:1', 'STATE', true));
    await vi.waitFor(() => expect(state()).toMatchObject({ STATE: false }));
  });

  it('keeps a value an event brought in meanwhile', async () => {
    let fail: (e: Error) => void = () => {};
    request.mockReturnValueOnce(new Promise((_, reject) => (fail = reject)));
    const { queryClient, set, state } = setup();
    act(() => set('HmIP-RF', 'A:1', 'LEVEL', 0.5));
    // The device reports another value before the answer
    act(() => {
      queryClient.setQueryData<Channel[]>(['channels', { roomId: '1' }], (channels) =>
        channels?.map((c) => ({ ...c, datapoints: { ...c.datapoints, LEVEL: 0.8 } }) as Channel),
      );
    });
    await act(async () => fail(new RequestError('timed out', 'TIMEOUT')));
    // Not rolled back to 0.2
    expect(state()).toMatchObject({ LEVEL: 0.8 });
  });
});
