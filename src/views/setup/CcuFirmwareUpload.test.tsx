import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithTheme } from '../../test/render';

const request = vi.fn();
vi.mock('../../hooks/useWebsocket', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../hooks/useWebsocket')>()),
  useWebSocketActions: () => ({ request }),
  useWebSocketContext: () => ({ authRequired: true }),
}));

const { CcuFirmwareUpload } = await import('./CcuFirmwareUpload');
const { RequestError } = await import('../../hooks/useWebsocket');

describe('CcuFirmwareUpload with download', () => {
  it('lets the CCU download the release, then asks for the licence', async () => {
    request.mockResolvedValueOnce({ success: true, eula: 'Licence text' });
    renderWithTheme(<CcuFirmwareUpload download="3.89.11.20260919" onClose={() => undefined} />);

    expect(screen.getByText(/3\.89\.11\.20260919/)).toBeTruthy();
    // No file to choose
    expect(screen.queryByLabelText(/file|Datei/i)).toBeNull();
    fireEvent.change(screen.getByLabelText(/password|Passwort/i), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: /Download and check|Herunterladen und prüfen/ }));

    await waitFor(() => expect(screen.getByText('Licence text')).toBeTruthy());
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'downloadCcuFirmware', password: 'secret' }),
      expect.objectContaining({ queue: false }),
    );
  });

  it('explains a checksum mismatch', async () => {
    request.mockRejectedValueOnce(new RequestError('mismatch', 'FIRMWARE_CHECKSUM'));
    renderWithTheme(<CcuFirmwareUpload download="3.89.11.20260919" onClose={() => undefined} />);
    fireEvent.change(screen.getByLabelText(/password|Passwort/i), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: /Download and check|Herunterladen und prüfen/ }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/checksum|Prüfsumme/));
  });
});
