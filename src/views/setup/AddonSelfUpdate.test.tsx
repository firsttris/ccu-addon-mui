import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithTheme } from '../../test/render';

const request = vi.fn();
let elevated = true;
vi.mock('../../hooks/useWebsocket', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../hooks/useWebsocket')>()),
  useWebSocketActions: () => ({ request }),
  useWebSocketContext: () => ({ elevated }),
}));

const reloadToNewApp = vi.fn();
vi.mock('../../lib/appUpdate', () => ({ reloadToNewApp: () => reloadToNewApp() }));

const { AddonSelfUpdate } = await import('./AddonSelfUpdate');
const { RequestError } = await import('../../hooks/useWebsocket');

const check = () => fireEvent.click(screen.getByRole('button', { name: /Check for update|Auf Update prüfen/ }));
const installButton = () => screen.findByRole('button', { name: /Install update|Update installieren/ });

describe('AddonSelfUpdate', () => {
  beforeEach(() => {
    request.mockReset();
    reloadToNewApp.mockReset();
    elevated = true;
  });

  it('says so when the add-on is up to date', async () => {
    request.mockResolvedValueOnce({ current: '1.0.4', latest: '1.0.4', installable: true });
    renderWithTheme(<AddonSelfUpdate current="1.0.4" />);
    check();
    await waitFor(() => expect(screen.getByText(/up to date|aktuell/)).toBeTruthy());
    expect(screen.queryByRole('button', { name: /Install update|Update installieren/ })).toBeNull();
  });

  it('installs a newer release after asking', async () => {
    request.mockResolvedValueOnce({ current: '1.0.4', latest: '1.0.5', installable: true });
    renderWithTheme(<AddonSelfUpdate current="1.0.4" />);
    check();
    fireEvent.click(await installButton());
    // The dialog says that the CCU does not restart
    expect(screen.getByRole('dialog').textContent).toMatch(/does not restart|startet dafür nicht neu/);

    request.mockResolvedValueOnce({ success: true, version: '1.0.5' });
    const buttons = screen.getAllByRole('button', { name: /Install update|Update installieren/ });
    fireEvent.click(buttons[buttons.length - 1]);
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/1\.0\.5/));
    expect(request).toHaveBeenLastCalledWith({ type: 'installSelfUpdate' }, expect.objectContaining({ queue: false }));
    // Switches to the new app right away
    expect(reloadToNewApp).toHaveBeenCalled();
  });

  it('needs the password entered again to install', async () => {
    elevated = false;
    request.mockResolvedValueOnce({ current: '1.0.4', latest: '1.0.5', installable: true });
    renderWithTheme(<AddonSelfUpdate current="1.0.4" />);
    check();
    expect(((await installButton()) as HTMLButtonElement).disabled).toBe(true);
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
    const buttons = screen.getAllByRole('button', { name: /Install update|Update installieren/ });
    fireEvent.click(buttons[buttons.length - 1]);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/checksum|Prüfsumme/));
  });
});
