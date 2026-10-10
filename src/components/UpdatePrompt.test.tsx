import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

const lookForNewApp = vi.fn();
let connectionStatus = 'Open';
vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({ needRefresh: [false], updateServiceWorker: vi.fn() }),
}));
vi.mock('../hooks/useWebsocket', () => ({ useWebSocketContext: () => ({ connectionStatus }) }));
vi.mock('../lib/appUpdate', () => ({
  lookForNewApp: () => lookForNewApp(),
  answerTabQuestions: () => () => undefined,
}));

const { UpdatePrompt } = await import('./UpdatePrompt');

describe('UpdatePrompt', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    lookForNewApp.mockReset();
    connectionStatus = 'Open';
  });
  afterEach(() => vi.useRealTimers());

  const reconnect = (rerender: (ui: React.ReactElement) => void) => {
    connectionStatus = 'Closed';
    rerender(<UpdatePrompt />);
    connectionStatus = 'Open';
    rerender(<UpdatePrompt />);
  };

  it('looks for a new app when the server is back, at most once a minute', () => {
    const { rerender } = render(<UpdatePrompt />);
    // Not on the first connect: the service worker was just registered
    expect(lookForNewApp).not.toHaveBeenCalled();

    reconnect(rerender);
    expect(lookForNewApp).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(10 * 1000);
    reconnect(rerender);
    expect(lookForNewApp).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(60 * 1000);
    reconnect(rerender);
    expect(lookForNewApp).toHaveBeenCalledTimes(2);
  });
});
