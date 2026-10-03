import React, {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import useWebSocket, { ReadyState } from 'react-use-websocket';
import { useQueryClient } from '@tanstack/react-query';
import { Channel, DeviceProblem, HmEvent, Room, Trade, UserLevel } from './../types/types';
import { useUniqueDeviceID } from './useUniqueDeviceID';
import { useToast } from '../contexts/ToastContext';
import { useTranslations } from '../i18n/utils';
import { applyEvent } from './channels';

// The transport: WebSocket connection, login, and requests answered by
// promises. All server data is loaded and cached with TanStack Query on top
// of request() (see queries/); events go straight into that cache.

export interface Response {
  type?:
    | 'subscribe_response'
    | 'error'
    | 'auth_response'
    | 'setDatapoint_response'
    | 'deviceProblems'
    | 'paramsetDescription'
    | 'paramset';
  error?: string;
  code?: string;
  rooms?: Room[];
  trades?: Trade[];
  channels?: Channel[];
  roomId?: string;
  tradeId?: string;
  all?: boolean;
  event?: HmEvent;
  deviceId?: string;
  success?: boolean;
  // auth_response
  authRequired?: boolean;
  token?: string;
  user?: string;
  level?: UserLevel;
  requestId?: string;
  // deviceProblems
  devices?: DeviceProblem[];
  // paramsetDescription, paramset
  description?: unknown;
  values?: Record<string, unknown>;
}

// A failed request; code is the server's error code, or NOT_CONNECTED and
// TIMEOUT from here.
export class RequestError extends Error {
  code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

export interface RequestOptions {
  // false: fail right away instead of waiting for the connection. For
  // commands: switching a light minutes later would be a surprise.
  queue?: boolean;
  timeoutMs?: number;
}

type Message = { type: string } & Record<string, unknown>;
type EventListener = (event: HmEvent) => void;

// 'pending' until the server answered the auth message sent on connect
export type AuthState = 'pending' | 'authenticated' | 'loginRequired';

interface PendingRequest {
  resolve: (response: Response) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

const TOKEN_STORAGE_KEY = 'ccu-addon-mui_AuthToken';
// Includes the time a request waits in the queue until logged in
const REQUEST_TIMEOUT_MS = 20000;

const readToken = () => {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
};

const writeToken = (token: string | null) => {
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Without storage the user has to log in again after a reload
  }
};

// Connect to WebSocket server via same host (works in dev and production)
const wsUrl =
  window.location.protocol === 'https:'
    ? `wss://${window.location.host}/ws/mui`
    : `ws://${window.location.host}/ws/mui`;

export const useWebsocket = () => {
  const [authState, setAuthState] = useState<AuthState>('pending');
  const [authRequired, setAuthRequired] = useState(false);
  const [userLevel, setUserLevel] = useState<UserLevel>('');
  const [loginError, setLoginError] = useState<string | null>(null);

  const deviceId = useUniqueDeviceID();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const t = useTranslations();

  // Requests made before the connection is open and authenticated
  const queuedRef = useRef(new Map<string, string>());
  const readyRef = useRef(false);
  const wasAuthenticatedRef = useRef(false);

  const nextRequestIdRef = useRef(0);
  const pendingRequestsRef = useRef(new Map<string, PendingRequest>());
  const eventListenersRef = useRef(new Set<EventListener>());

  // The channels events are wanted for. The server keeps one list per
  // connection, so it is sent again after every (re)connect.
  const subscriptionRef = useRef<string[]>([]);

  // Every message is handled here as it arrives. lastMessage would be
  // overwritten when several messages come in before React renders (e.g. a
  // multicall from the CCU with several datapoints), losing all but the last.
  const handleMessage = (message: MessageEvent) => {
    try {
      if (!message.data || message.data.trim() === '') {
        return;
      }

      const response = JSON.parse(message.data) as Response;

      const pendingRequest = response.requestId
        ? pendingRequestsRef.current.get(response.requestId)
        : undefined;
      if (pendingRequest && response.requestId) {
        clearTimeout(pendingRequest.timeout);
        pendingRequestsRef.current.delete(response.requestId);
        if (response.type === 'error') {
          pendingRequest.reject(new RequestError(response.error ?? 'request failed', response.code));
          // A rejected request may also mean the login has expired
          if (response.code !== 'AUTH_REQUIRED') {
            return;
          }
        } else {
          pendingRequest.resolve(response);
          return;
        }
      }

      if (response.event) {
        for (const listener of eventListenersRef.current) {
          listener(response.event);
        }
        return;
      }

      switch (response.type) {
        case 'auth_response':
          handleAuthResponse(response);
          return;
        case 'error':
          if (response.code === 'AUTH_REQUIRED') {
            setAuthState('loginRequired');
            return;
          }
          console.error('WebSocket server error:', response.error);
          showToast(`${t('SERVER_ERROR')}: ${response.error}`);
          return;
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  };

  const { sendMessage, readyState, getWebSocket } = useWebSocket(wsUrl, {
    shouldReconnect: () => true,
    reconnectInterval: 3000,
    reconnectAttempts: Infinity,
    onMessage: handleMessage,
    // Messages are handled in onMessage; don't store them as lastMessage,
    // which would re-render on every message.
    filter: () => false,
  });

  const sendSubscription = useCallback(() => {
    if (readyRef.current && subscriptionRef.current.length > 0) {
      sendMessage(
        JSON.stringify({ type: 'subscribe', deviceId, channels: subscriptionRef.current }),
        false,
      );
    }
  }, [deviceId, sendMessage]);

  // Sends a request and resolves with its response, matched by requestId.
  // Waits for the login unless options.queue is false.
  const request = useCallback(
    (message: Message, { queue = true, timeoutMs = REQUEST_TIMEOUT_MS }: RequestOptions = {}) =>
      new Promise<Response>((resolve, reject) => {
        if (!queue && !readyRef.current) {
          reject(new RequestError('not connected', 'NOT_CONNECTED'));
          return;
        }
        const requestId = `q${nextRequestIdRef.current++}`;
        pendingRequestsRef.current.set(requestId, {
          resolve,
          reject,
          timeout: setTimeout(() => {
            pendingRequestsRef.current.delete(requestId);
            queuedRef.current.delete(requestId);
            reject(new RequestError(`${message.type} timed out`, 'TIMEOUT'));
          }, timeoutMs),
        });
        const json = JSON.stringify({ ...message, deviceId, requestId });
        if (readyRef.current) {
          sendMessage(json, false);
        } else {
          queuedRef.current.set(requestId, json);
        }
      }),
    [deviceId, sendMessage],
  );

  // Asks for events of these channels (replacing the previous list)
  const subscribe = useCallback(
    (addresses: string[]) => {
      subscriptionRef.current = addresses;
      sendSubscription();
    },
    [sendSubscription],
  );

  const addEventListener = useCallback((listener: EventListener) => {
    eventListenersRef.current.add(listener);
    return () => {
      eventListenersRef.current.delete(listener);
    };
  }, []);

  const handleAuthResponse = (response: Response) => {
    setAuthRequired(response.authRequired === true);
    if (!response.success) {
      readyRef.current = false;
      if (response.code === 'LOGIN_REQUIRED') {
        // No or an outdated token: not an error the user has to see
        writeToken(null);
        setLoginError(null);
      } else {
        setLoginError(response.code ?? 'INVALID_CREDENTIALS');
      }
      setAuthState('loginRequired');
      return;
    }

    if (response.token) {
      // Renewed on every connect, so a device in regular use stays logged in
      writeToken(response.token);
    }
    setLoginError(null);
    setUserLevel(response.level ?? '');
    setAuthState('authenticated');
    readyRef.current = true;

    for (const json of queuedRef.current.values()) {
      sendMessage(json, false);
    }
    queuedRef.current.clear();
    sendSubscription();

    // Data may have changed while disconnected. Not on the first login:
    // the queries' first requests were just sent.
    if (wasAuthenticatedRef.current) {
      queryClient.invalidateQueries();
    }
    wasAuthenticatedRef.current = true;
  };

  // Authenticate first on every (re)connect; the server rejects everything else
  useEffect(() => {
    if (readyState === ReadyState.OPEN) {
      // Without a token the answer will be "log in"; don't flash the app meanwhile
      setAuthState((prev) => (prev === 'loginRequired' && !readToken() ? prev : 'pending'));
      sendMessage(JSON.stringify({ type: 'auth', token: readToken() ?? undefined }), false);
    } else {
      readyRef.current = false;
    }
  }, [readyState, sendMessage]);

  const login = useCallback(
    (username: string, password: string) => {
      setLoginError(null);
      sendMessage(JSON.stringify({ type: 'login', username, password }), false);
    },
    [sendMessage],
  );

  const logout = useCallback(() => {
    writeToken(null);
    readyRef.current = false;
    setAuthState('loginRequired');
    // The server still treats this connection as logged in; reconnect
    getWebSocket()?.close();
  }, [getWebSocket]);

  const connectionStatus = {
    [ReadyState.CONNECTING]: 'Connecting',
    [ReadyState.OPEN]: 'Open',
    [ReadyState.CLOSING]: 'Closing',
    [ReadyState.CLOSED]: 'Closed',
    [ReadyState.UNINSTANTIATED]: 'Uninstantiated',
  }[readyState];

  // All functions are stable, so this object doesn't change on events
  const actions = useMemo(
    () => ({ request, subscribe, addEventListener, login, logout }),
    [request, subscribe, addEventListener, login, logout],
  );

  const state = useMemo(
    () => ({ ...actions, connectionStatus, authState, authRequired, userLevel, loginError }),
    [actions, connectionStatus, authState, authRequired, userLevel, loginError],
  );

  return { actions, state };
};

export type UseWebsocketReturnType = ReturnType<typeof useWebsocket>['state'];
export type WebSocketActions = ReturnType<typeof useWebsocket>['actions'];

const WebSocketContext = createContext<UseWebsocketReturnType | undefined>(undefined);

// Separate context for the actions: controls and queries only need these
// and must not re-render when the connection state changes.
const WebSocketActionsContext = createContext<WebSocketActions | undefined>(undefined);

export const WebSocketProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { actions, state } = useWebsocket();
  const queryClient = useQueryClient();

  // Values from the CCU go straight into the cached channel lists. Only the
  // channel concerned gets a new object, so React.memo skips all others.
  useEffect(
    () =>
      actions.addEventListener((event) => {
        queryClient.setQueriesData<Channel[]>({ queryKey: ['channels'] }, (channels) =>
          channels ? applyEvent(channels, event) : channels,
        );
      }),
    [actions, queryClient],
  );

  return (
    <WebSocketActionsContext.Provider value={actions}>
      <WebSocketContext.Provider value={state}>{children}</WebSocketContext.Provider>
    </WebSocketActionsContext.Provider>
  );
};

export const useWebSocketContext = () => {
  const context = useContext(WebSocketContext);
  if (context === undefined) {
    throw new Error('useWebSocketContext must be used within a WebSocketProvider');
  }
  return context;
};

export const useWebSocketActions = () => {
  const context = useContext(WebSocketActionsContext);
  if (context === undefined) {
    throw new Error('useWebSocketActions must be used within a WebSocketProvider');
  }
  return context;
};
