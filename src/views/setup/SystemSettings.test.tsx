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

const { Clock, Power, RegaVersion } = await import('./SystemSettings');

const renderWithProviders = (ui: React.ReactElement) =>
  renderWithTheme(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );

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

  it('chooses the logic layer, then offers a restart, as the eQ-3 maintenance page', async () => {
    request.mockReset();
    request.mockImplementation(async (message: { type: string }) =>
      message.type === 'getSystemSettings'
        ? {
            latitude: 50,
            longitude: 8,
            timeZoneOffset: 60,
            time: '',
            canPower: true,
            canSetClock: true,
            regaVersion: 'COMMUNITY',
          }
        : { success: true },
    );
    renderWithProviders(<RegaVersion />);
    fireEvent.change(await screen.findByLabelText('Logic layer version'), { target: { value: 'NORMAL' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(request).toHaveBeenCalledWith({ type: 'setRegaVersion', version: 'NORMAL' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Restart now' }));
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith({ type: 'powerAction', action: 'reboot' }, { queue: false }),
    );
  });

  it('shows no choice where the CCU has one ReGaHss (OpenCCU)', async () => {
    request.mockReset();
    request.mockResolvedValue({
      latitude: 50,
      longitude: 8,
      timeZoneOffset: 60,
      time: '',
      canPower: true,
      canSetClock: true,
    });
    const { container } = renderWithProviders(<RegaVersion />);
    await waitFor(() => expect(request).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });

  it('sets the clock by hand with a date and time picker, as cp_time.cgi', async () => {
    request.mockReset();
    request.mockImplementation(async (message: { type: string }) =>
      message.type === 'getSystemSettings'
        ? { latitude: 50, longitude: 8, timeZoneOffset: 60, time: '', canPower: true, canSetClock: true }
        : { success: true },
    );
    renderWithProviders(<Clock />);
    const field = await screen.findByLabelText('Date and time');
    expect(field.getAttribute('type')).toBe('datetime-local');
    fireEvent.change(field, { target: { value: '2026-12-24T18:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set clock' }));
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith({ type: 'setClock', time: '2026-12-24 18:30:00' }, { queue: false }),
    );
  });
});
