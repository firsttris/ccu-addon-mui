import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderWithTheme } from '../../test/render';
import { ToastProvider } from '../../contexts/ToastContext';

const request = vi.fn();
vi.mock('../../hooks/useWebsocket', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../hooks/useWebsocket')>()),
  useWebSocketActions: () => ({ request }),
  useWebSocketContext: () => ({ authRequired: true, elevated: true }),
}));

const { Power } = await import('./SystemSettings');

describe('maintenance', () => {
  it('restarts in safe mode after asking, as cp_maintenance.cgi OnEnterSafeMode', async () => {
    request.mockImplementation(async (message: { type: string }) =>
      message.type === 'getSystemSettings'
        ? {
            latitude: 50,
            longitude: 8,
            timeZoneOffset: 60,
            time: '2026-10-04 12:00:00',
            canPower: true,
            canSetClock: true,
          }
        : { success: true },
    );
    renderWithTheme(
      <QueryClientProvider client={new QueryClient()}>
        <ToastProvider>
          <Power />
        </ToastProvider>
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: /Restart in safe mode/ }));
    // The dialog says that add-ons, this one too, do not start
    expect(screen.getByText(/add-ons are not started, this one neither/)).toBeTruthy();
    const buttons = screen.getAllByRole('button', { name: /Restart in safe mode/ });
    fireEvent.click(buttons[buttons.length - 1]);
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith({ type: 'powerAction', action: 'safemode' }, { queue: false }),
    );
  });
});
