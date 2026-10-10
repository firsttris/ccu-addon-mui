import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithTheme } from '../../test/render';

const request = vi.fn();
const elevate = vi.fn();
let elevated = true;
vi.mock('../../hooks/useWebsocket', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../hooks/useWebsocket')>()),
  useWebSocketActions: () => ({ request, elevate }),
  useWebSocketContext: () => ({ elevated, connectionStatus: 'Open' }),
}));

const { AddonSelfUpdate } = await import('./AddonSelfUpdate');
const { RequestError } = await import('../../hooks/useWebsocket');
const { emitSelfUpdateProgress } = await import('../../lib/selfUpdateProgress');

const check = () => fireEvent.click(screen.getByRole('button', { name: /Check for update|Auf Update prüfen/ }));
const installButton = () => screen.findByRole('button', { name: /Install update|Update installieren/ });
// The wizard's own "Install update", after the one next to the version
const confirm = () => {
  const buttons = screen.getAllByRole('button', { name: /Install update|Update installieren/ });
  fireEvent.click(buttons[buttons.length - 1]);
};
const activeStep = () => screen.getByRole('list').querySelector('[aria-current="step"]')?.textContent;

describe('AddonSelfUpdate', () => {
  beforeEach(() => {
    request.mockReset();
    elevate.mockReset();
    elevated = true;
  });

  it("asks GitHub now, not the server's last check", async () => {
    request.mockResolvedValueOnce({ current: '1.0.4', latest: '1.0.4', installable: true });
    renderWithTheme(<AddonSelfUpdate current="1.0.4" />);
    check();
    await waitFor(() => expect(screen.getByText(/up to date|aktuell/)).toBeTruthy());
    expect(request).toHaveBeenCalledWith({ type: 'checkSelfUpdate', force: true }, expect.anything());
    expect(screen.queryByRole('button', { name: /Install update|Update installieren/ })).toBeNull();
  });

  it('installs a newer release step by step', async () => {
    request.mockResolvedValueOnce({ current: '1.0.4', latest: '1.0.5', installable: true });
    renderWithTheme(<AddonSelfUpdate current="1.0.4" />);
    check();
    fireEvent.click(await installButton());
    // The wizard says that the CCU does not restart
    expect(screen.getByRole('dialog').textContent).toMatch(/does not restart|startet dafür nicht neu/);

    let answer: (value: unknown) => void = () => undefined;
    request.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    confirm();
    expect(request).toHaveBeenLastCalledWith({ type: 'installSelfUpdate' }, expect.objectContaining({ queue: false }));

    // The download as the server reports it, with its bytes
    act(() =>
      emitSelfUpdateProgress({
        type: 'selfUpdateProgress',
        phase: 'download',
        done: 2.5 * 1024 * 1024,
        total: 5 * 1024 * 1024,
      }),
    );
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('50');
    act(() => emitSelfUpdateProgress({ type: 'selfUpdateProgress', phase: 'unpack' }));
    expect(activeStep()).toMatch(/Unpack|Entpacken/);

    // Installed: the wizard waits for the server to restart
    await act(async () => answer({ success: true, version: '1.0.5' }));
    await waitFor(() => expect(activeStep()).toMatch(/restarts|startet neu/));
  });

  it('asks for the password again before it installs', async () => {
    elevated = false;
    request.mockResolvedValueOnce({ current: '1.0.4', latest: '1.0.5', installable: true });
    renderWithTheme(<AddonSelfUpdate current="1.0.4" />);
    check();
    fireEvent.click(await installButton());
    confirm();
    expect(screen.getAllByLabelText(/password|Passwort/i).length).toBeGreaterThan(0);
    expect(request).not.toHaveBeenCalledWith({ type: 'installSelfUpdate' }, expect.anything());
  });

  it('links the release where it cannot install', async () => {
    request.mockResolvedValueOnce({ current: '1.0.4', latest: '1.0.5', installable: false });
    renderWithTheme(<AddonSelfUpdate current="1.0.4" />);
    check();
    await waitFor(() => expect(screen.getByRole('link').getAttribute('href')).toMatch(/releases\/latest/));
    expect(screen.queryByRole('button', { name: /Install update|Update installieren/ })).toBeNull();
  });

  it('explains a corrupted download', async () => {
    request.mockResolvedValueOnce({ current: '1.0.4', latest: '1.0.5', installable: true });
    renderWithTheme(<AddonSelfUpdate current="1.0.4" />);
    check();
    fireEvent.click(await installButton());
    request.mockRejectedValueOnce(new RequestError('mismatch', 'CHECKSUM'));
    confirm();
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/checksum|Prüfsumme/));
  });
});
