import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithTheme } from '../../../test/render';
import { ToastProvider } from '../../../contexts/ToastContext';

const days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
// An HM-TC-IT-WM: three profiles in the device's MASTER, WEEK_PROGRAM_POINTER 0-2
const description = {
  WEEK_PROGRAM_POINTER: { type: 'INTEGER', MIN: 0, MAX: 2 },
  ...Object.fromEntries(
    [1, 2, 3].flatMap((p) =>
      days.flatMap((day) =>
        Array.from({ length: 13 }, (_, i) => [
          [`P${p}_ENDTIME_${day}_${i + 1}`, { type: 'INTEGER' }],
          [`P${p}_TEMPERATURE_${day}_${i + 1}`, { type: 'FLOAT' }],
        ]).flat(),
      ),
    ),
  ),
};
const values = { WEEK_PROGRAM_POINTER: 1 };

const mutate = vi.fn();
const setDataPoint = vi.fn();
vi.mock('../../../queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../queries')>()),
  useParamsetDescription: () => ({ data: description, isPending: false }),
  useParamset: () => ({ data: values }),
  usePutParamset: () => ({ mutate, isPending: false }),
  useSetDataPoint: () => setDataPoint,
}));
vi.mock('../../../hooks/useWebsocket', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../hooks/useWebsocket')>()),
  useWebSocketContext: () => ({ userLevel: 'admin', elevated: true }),
  useWebSocketActions: () => ({ request: vi.fn() }),
}));

const { WeekProfileSheet } = await import('./WeekProfileSheet');

describe('WeekProfileSheet on a BidCos wall thermostat', () => {
  it('shows the running profile from WEEK_PROGRAM_POINTER and switches it in MASTER', () => {
    renderWithTheme(
      <ToastProvider>
        <WeekProfileSheet open onOpenChange={() => {}} interfaceName="BidCos-RF" address="LEQ0000009" name="Flur" />
      </ToastProvider>,
    );
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    // Profile 2 runs (pointer 1)
    expect(tabs[1].querySelector('[aria-label]')).not.toBeNull();
    fireEvent.click(tabs[0]);
    fireEvent.click(screen.getByRole('button', { name: /Dieses Profil verwenden|Use this profile/ }));
    expect(mutate).toHaveBeenCalledWith(
      { interfaceName: 'BidCos-RF', address: 'LEQ0000009', values: { WEEK_PROGRAM_POINTER: 0 } },
      expect.anything(),
    );
    expect(setDataPoint).not.toHaveBeenCalled();
  });
});
