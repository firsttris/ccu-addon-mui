import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderWithTheme } from '../test/render';
import { ToastProvider } from '../contexts/ToastContext';
import { CCU_CAPABILITIES } from '../hooks/capabilities';

vi.mock('../hooks/useWebsocket', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../hooks/useWebsocket')>()),
  useWebSocketActions: () => ({ request: vi.fn(async () => ({})) }),
  useWebSocketContext: () => ({ userLevel: 'admin', elevated: false, capabilities: CCU_CAPABILITIES }),
}));

const { Dashboard } = await import('./Dashboard');

const render = (ui: React.ReactElement) =>
  renderWithTheme(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );

describe('Dashboard', () => {
  it('shows a failed load with a retry, not "no devices"', () => {
    const retry = vi.fn();
    render(<Dashboard channelsByType={[]} error={new Error('getChannels timed out')} onRetry={retry} />);
    expect(screen.getByRole('alert').textContent).toContain('getChannels timed out');
    expect(screen.queryByText(/noch keine Geräte|No devices here yet/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Erneut versuchen|Try again/ }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('says so when a place has no devices', () => {
    render(<Dashboard channelsByType={[]} />);
    expect(screen.getByText(/noch keine Geräte|No devices here yet/)).toBeTruthy();
  });
});
