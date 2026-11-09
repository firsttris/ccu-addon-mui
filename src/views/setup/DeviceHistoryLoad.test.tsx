import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderWithTheme } from '../../test/render';

const request = vi.fn();
vi.mock('../../hooks/useWebsocket', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../hooks/useWebsocket')>()),
  useWebSocketActions: () => ({ request }),
}));
vi.mock('../../queries/home', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../queries/home')>()),
  useChannelList: () => ({ data: [{ id: 1234, address: 'ABC0001:1', name: 'Wohnzimmer Licht', logged: true }] }),
}));

const { DeviceHistory } = await import('./DeviceHistory');
const { RequestError } = await import('../../hooks/useWebsocket');

describe('DeviceHistory loading', () => {
  // getHistory answers an error when the script stopped (#299): the channel
  // says so instead of loading forever
  it('tells a failed read instead of loading forever', async () => {
    request.mockRejectedValue(new RequestError('getHistory failed: script stopped before its end', 'CCU_ERROR'));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderWithTheme(
      <QueryClientProvider client={client}>
        <DeviceHistory address="ABC0001" />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(request).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText(/script stopped before its end/)).toBeTruthy());
  });
});
