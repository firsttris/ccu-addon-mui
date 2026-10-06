import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { ToastProvider } from '../contexts/ToastContext';

// react-use-websocket replaced by a socket the test drives: its ready state,
// what the app sends, and messages from the server
const socket = vi.hoisted(() => {
  const state = {
    readyState: 0,
    sent: [] as Record<string, unknown>[],
    onMessage: undefined as ((event: MessageEvent) => void) | undefined,
    // Stable, as the library's: the hook's connect effect depends on it
    sendMessage: (json: string) => state.sent.push(JSON.parse(json)),
  };
  return state;
});
vi.mock('react-use-websocket', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-use-websocket')>();
  return {
    ...actual,
    default: (_url: string, options: { onMessage: (event: MessageEvent) => void }) => {
      socket.onMessage = options.onMessage;
      return {
        sendMessage: socket.sendMessage,
        readyState: socket.readyState,
        getWebSocket: () => null,
      };
    },
  };
});

const { useWebsocket, RequestError } = await import('./useWebsocket');
const { ReadyState } = await import('react-use-websocket');

const fromServer = (message: Record<string, unknown>) =>
  act(() => socket.onMessage?.({ data: JSON.stringify(message) } as MessageEvent));
const sentOf = (type: string) => socket.sent.filter((m) => m.type === type);

const setup = () => {
  const queryClient = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
  const hook = renderHook(() => useWebsocket(), { wrapper });
  const open = () => {
    socket.readyState = ReadyState.OPEN;
    hook.rerender();
  };
  const close = () => {
    socket.readyState = ReadyState.CLOSED;
    hook.rerender();
  };
  const login = () => fromServer({ type: 'auth_response', success: true, level: 'admin', requestId: undefined });
  return { hook, queryClient, open, close, login };
};

beforeEach(() => {
  socket.readyState = ReadyState.CONNECTING;
  socket.sent = [];
  localStorage.clear();
});

describe('useWebsocket', () => {
  it('authenticates on connect and sends requests made before only after the login', async () => {
    const { hook, open, login } = setup();
    let answer: unknown;
    act(() => {
      hook.result.current.actions.request({ type: 'getRooms' }).then((r) => (answer = r));
    });
    expect(socket.sent).toEqual([]);

    open();
    expect(sentOf('auth')).toHaveLength(1);
    expect(sentOf('getRooms')).toHaveLength(0);

    login();
    expect(hook.result.current.state.authState).toBe('authenticated');
    const [request] = sentOf('getRooms');
    expect(request.requestId).toEqual(expect.any(String));

    await fromServer({ type: 'getRooms_response', requestId: request.requestId, rooms: [{ id: 1, name: 'Bad' }] });
    await vi.waitFor(() => expect(answer).toMatchObject({ rooms: [{ id: 1, name: 'Bad' }] }));
  });

  it("rejects with the server's error code", async () => {
    const { hook, open, login } = setup();
    open();
    login();
    let failure: unknown;
    act(() => {
      hook.result.current.actions.request({ type: 'getRooms' }).catch((e) => (failure = e));
    });
    const [request] = sentOf('getRooms');
    await fromServer({ type: 'error', requestId: request.requestId, error: 'nope', code: 'FORBIDDEN' });
    await vi.waitFor(() => expect(failure).toBeInstanceOf(RequestError));
    expect((failure as InstanceType<typeof RequestError>).code).toBe('FORBIDDEN');
  });

  it('fails requests on a lost connection right away and sends queued ones after the next login', async () => {
    const { hook, open, close, login } = setup();
    open();
    login();
    let failure: unknown;
    act(() => {
      hook.result.current.actions.request({ type: 'getRooms' }).catch((e) => (failure = e));
    });
    close();
    await vi.waitFor(() => expect((failure as InstanceType<typeof RequestError>)?.code).toBe('NOT_CONNECTED'));

    // Asked while disconnected: waits for the next login
    act(() => {
      hook.result.current.actions.request({ type: 'getTrades' }).catch(() => undefined);
    });
    expect(sentOf('getTrades')).toHaveLength(0);
    open();
    login();
    expect(sentOf('getTrades')).toHaveLength(1);
  });

  it('refuses a request that must not wait while disconnected', async () => {
    const { hook } = setup();
    await expect(hook.result.current.actions.request({ type: 'getRooms' }, { queue: false })).rejects.toMatchObject({
      code: 'NOT_CONNECTED',
    });
  });

  it('passes events to the listeners and keeps them for lists loading meanwhile', () => {
    const { hook, open, login } = setup();
    open();
    login();
    const events: unknown[] = [];
    act(() => {
      hook.result.current.actions.addEventListener((e) => events.push(e));
    });
    const startedAt = hook.result.current.actions.recent.time();
    fromServer({ event: { channel: 'A:1', datapoint: 'STATE', value: true } });
    expect(events).toEqual([{ channel: 'A:1', datapoint: 'STATE', value: true }]);
    const channels = hook.result.current.actions.recent.channelsSince(
      [{ id: 1, name: 'Licht', address: 'A:1', interfaceName: 'HmIP-RF', type: 'SWITCH_VIRTUAL_RECEIVER', datapoints: { STATE: false } }],
      startedAt,
    );
    expect(channels[0].datapoints).toEqual({ STATE: true });
  });

  it('puts pushed system variables and alarms into the query cache', () => {
    const { queryClient, open, login } = setup();
    open();
    login();
    fromServer({ type: 'sysvars', sysvars: [{ id: 1 }] });
    fromServer({ type: 'alarmMessages', alarms: [{ id: 2 }] });
    expect(queryClient.getQueryData(['sysvars'])).toEqual([{ id: 1 }]);
    expect(queryClient.getQueryData(['alarmMessages'])).toEqual([{ id: 2 }]);
  });

  it('asks for the login when the token is refused', () => {
    const { hook, open } = setup();
    open();
    fromServer({ type: 'auth_response', success: false, code: 'LOGIN_REQUIRED', authRequired: true });
    expect(hook.result.current.state.authState).toBe('loginRequired');
  });
});
