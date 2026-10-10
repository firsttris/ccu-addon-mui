import type React from 'react';
import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import useWebSocket, { ReadyState } from 'react-use-websocket';
import { useQueryClient } from '@tanstack/react-query';
import type { Channel, HmEvent, UserLevel } from './../types/types';
import { useUniqueDeviceID } from './useUniqueDeviceID';
import { useToast } from '../contexts/ToastContext';
import { applyEvent } from './channels';
import { RecentUpdates } from './recentUpdates';
import type { Protocol } from '../types/protocol';
import { type Capabilities, CCU_CAPABILITIES, type Platform } from './capabilities';
import { m } from '../paraglide/messages';
import { emitSelfUpdateProgress } from '../lib/selfUpdateProgress';
import type { SelfUpdateProgressMessage } from '../types/protocol';

// The transport: WebSocket connection, login, and requests answered by
// promises. All server data is loaded and cached with TanStack Query on top
// of request() (see queries/); events go straight into that cache.

// Every request type with its request and response, generated from
// protocol/schema.json (npm run generate:protocol)
export type RequestType = keyof Protocol;
export type ResponseOf<T extends RequestType> = Protocol[T]['response'];
// A request as passed to request(): requestId and deviceId are added there
export type RequestMessage = {
  [T in RequestType]: Omit<Protocol[T]['request'], 'requestId' | 'deviceId'>;
}[RequestType];

// Any message from the server, loosely typed for dispatching: the fields
// read here. Answers to requests are typed by ResponseOf.
interface Response {
  type?: 'selfUpdateProgress' | 'error' | 'auth_response' | 'sysvars' | 'alarmMessages' | 'serviceMessages';
  requestId?: string;
  error?: string;
  code?: string;
  event?: HmEvent;
  success?: boolean;
  // auth_response
  authRequired?: boolean;
  token?: string;
  level?: UserLevel;
  // auth_response, elevate_response: for changing settings
  adminToken?: string;
  elevated?: boolean;
  // When the admin rights end (RFC 3339)
  elevatedUntil?: string;
  // auth_response: what the add-on runs on and what it can do there
  platform?: Platform;
  capabilities?: Capabilities;
  // Lists the server sends to all apps when they change
  sysvars?: unknown[];
  alarms?: unknown[];
  messages?: unknown[];
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

// Asking again gets the same answer: the request was refused or is wrong.
// NOT_CONNECTED: the connection was lost; all queries are loaded again after
// the next login anyway.
const FINAL_ERRORS = new Set([
  'NOT_CONNECTED',
  'AUTH_REQUIRED',
  'FORBIDDEN',
  'ELEVATION_REQUIRED',
  'INVALID_REQUEST',
  'INVALID_MESSAGE',
  'INVALID_VALUE',
  'NOT_SUPPORTED',
  'NOT_AVAILABLE',
  'NOT_FOUND',
]);

// Whether TanStack Query tries a failed query again: twice for a timeout
// or a CCU error, not for an answer that won't change
export const shouldRetry = (failureCount: number, error: unknown) =>
  failureCount < 2 && !(error instanceof RequestError && error.code !== undefined && FINAL_ERRORS.has(error.code));

export interface RequestOptions {
  // false: fail right away instead of waiting for the connection. For
  // commands: switching a light minutes later would be a surprise.
  queue?: boolean;
  timeoutMs?: number;
}

type EventListener = (event: HmEvent) => void;

// 'pending' until the server answered the auth message sent on connect;
// 'sessionRequired' when the platform's session (openccu-lite) expired:
// only its own login page can renew it
export type AuthState = 'pending' | 'authenticated' | 'loginRequired' | 'sessionRequired';

interface PendingRequest {
  resolve: (response: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

const TOKEN_STORAGE_KEY = 'ccu-addon-mui_AuthToken';
// Short-lived token for changing settings (administrators)
const ADMIN_TOKEN_STORAGE_KEY = 'ccu-addon-mui_AdminToken';
// Includes the time a request waits in the queue until logged in
const REQUEST_TIMEOUT_MS = 20000;

const readToken = (key = TOKEN_STORAGE_KEY) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

// Logged out on purpose in this tab: the login page, not the automatic
// login (as the WebUI's logout.htm with NoAutoLogin); a new tab logs in
// automatically again
const LOGGED_OUT_KEY = 'mui-logged-out';
const loggedOut = () => {
  try {
    return sessionStorage.getItem(LOGGED_OUT_KEY) === '1';
  } catch {
    return false;
  }
};
const setLoggedOut = (value: boolean) => {
  try {
    if (value) sessionStorage.setItem(LOGGED_OUT_KEY, '1');
    else sessionStorage.removeItem(LOGGED_OUT_KEY);
  } catch {
    // Storage not available: logging out works, the automatic login returns
  }
};

const writeToken = (token: string | null, key = TOKEN_STORAGE_KEY) => {
  try {
    if (token) {
      localStorage.setItem(key, token);
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    // Without storage the user has to log in again after a reload
  }
};

// The WebSocket server on the same host, the paths to try in order.
// Installed, the app lies under /addons/mui/ and so does the WebSocket: on
// openccu-lite only there the session gate passes the login on
// (X-Occulite-Session). A CCU whose lighttpd has not loaded the new mui.conf
// yet (update_script's reload missing or failed) knows only /ws/mui, so the
// app falls back to it while no connection has opened. The dev server
// proxies /ws/mui.
export const socketPaths = (base: string) => (base === '/' ? ['/ws/mui'] : [`${base}ws`, '/ws/mui']);
const paths = socketPaths(import.meta.env.BASE_URL);
const socketUrl = (path: string) =>
  `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}${path}`;

// openccu-lite could not check the session (occulited restarting): ask again
const AUTH_RETRY_MS = 3000;

export const useWebsocket = () => {
  const [authState, setAuthState] = useState<AuthState>('pending');
  const [authRequired, setAuthRequired] = useState(false);
  const [userLevel, setUserLevel] = useState<UserLevel>('');
  // May change settings: password entered recently (admin token)
  const [elevated, setElevated] = useState(false);
  // When the admin rights end (ms), unknown without authentication
  const [elevatedUntil, setElevatedUntil] = useState<number>();
  const [loginError, setLoginError] = useState<string | null>(null);
  // A CCU until the server says otherwise
  const [platform, setPlatform] = useState<Platform>('ccu');
  const [capabilities, setCapabilities] = useState<Capabilities>(CCU_CAPABILITIES);
  // The path in use (socketPaths) and whether any connection opened yet:
  // after that the path stays. A ref, read for every (re)connect: switching
  // waits for the next attempt (reconnectInterval) instead of reconnecting
  // at once, as a new url would
  const pathRef = useRef(0);
  const openedRef = useRef(false);
  const url = useCallback(() => socketUrl(paths[pathRef.current]), []);
  // Counts the auth messages to send again (SYSTEM_UNAVAILABLE)
  const [authAttempt, setAuthAttempt] = useState(0);
  const authRetryRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const deviceId = useUniqueDeviceID();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  // Requests made before the connection is open and authenticated
  const queuedRef = useRef(new Map<string, string>());
  const readyRef = useRef(false);
  const wasAuthenticatedRef = useRef(false);

  const nextRequestIdRef = useRef(0);
  const pendingRequestsRef = useRef(new Map<string, PendingRequest>());
  const eventListenersRef = useRef(new Set<EventListener>());
  // For lists requested while pushes came in (recentUpdates.ts)
  const recentRef = useRef(new RecentUpdates());

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

      const pendingRequest = response.requestId ? pendingRequestsRef.current.get(response.requestId) : undefined;
      if (pendingRequest && response.requestId) {
        clearTimeout(pendingRequest.timeout);
        pendingRequestsRef.current.delete(response.requestId);
        if (response.type === 'error') {
          pendingRequest.reject(new RequestError(response.error ?? 'request failed', response.code));
          if (response.code === 'ELEVATION_REQUIRED') {
            // The admin token has expired
            setElevated(false);
          }
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
        recentRef.current.addEvent(response.event);
        for (const listener of eventListenersRef.current) {
          listener(response.event);
        }
        return;
      }

      switch (response.type) {
        case 'auth_response':
          handleAuthResponse(response);
          return;
        // System variables changed (the server reads them for all apps)
        case 'sysvars':
          recentRef.current.setList('sysvars', response.sysvars ?? []);
          queryClient.setQueryData(['sysvars'], response.sysvars);
          return;
        // Alarms and service messages changed (read for all apps, too)
        case 'alarmMessages':
          recentRef.current.setList('alarmMessages', response.alarms ?? []);
          queryClient.setQueryData(['alarmMessages'], response.alarms);
          return;
        // How far the update of the add-on this app started is
        case 'selfUpdateProgress':
          emitSelfUpdateProgress(response as unknown as SelfUpdateProgressMessage);
          return;
        case 'serviceMessages':
          recentRef.current.setList('serviceMessages', response.messages ?? []);
          queryClient.setQueryData(['serviceMessages'], response.messages);
          return;
        case 'error':
          if (response.code === 'AUTH_REQUIRED') {
            setAuthState('loginRequired');
            return;
          }
          console.error('WebSocket server error:', response.error);
          showToast(`${m.SERVER_ERROR()}: ${response.error}`);
          return;
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  };

  const { sendMessage, readyState, getWebSocket } = useWebSocket(url, {
    onOpen: () => {
      openedRef.current = true;
    },
    onClose: () => {
      if (!openedRef.current) pathRef.current = (pathRef.current + 1) % paths.length;
    },
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
      sendMessage(JSON.stringify({ type: 'subscribe', deviceId, channels: subscriptionRef.current }), false);
    }
  }, [deviceId, sendMessage]);

  // Sends a request and resolves with its response, matched by requestId.
  // Waits for the login unless options.queue is false.
  const request = useCallback(
    <M extends RequestMessage>(message: M, { queue = true, timeoutMs = REQUEST_TIMEOUT_MS }: RequestOptions = {}) =>
      new Promise<ResponseOf<M['type']>>((resolve, reject) => {
        if (!queue && !readyRef.current) {
          reject(new RequestError('not connected', 'NOT_CONNECTED'));
          return;
        }
        const requestId = `q${nextRequestIdRef.current++}`;
        pendingRequestsRef.current.set(requestId, {
          resolve: (response) => resolve(response as ResponseOf<M['type']>),
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
      if (response.code === 'SESSION_REQUIRED') {
        setLoginError(null);
        setAuthState('sessionRequired');
        return;
      }
      if (response.code === 'SYSTEM_UNAVAILABLE') {
        // The session may well be valid: no login page, ask again shortly
        setLoginError(null);
        setAuthState('pending');
        clearTimeout(authRetryRef.current);
        authRetryRef.current = setTimeout(() => setAuthAttempt((attempt) => attempt + 1), AUTH_RETRY_MS);
        return;
      }
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
    if (response.adminToken) {
      writeToken(response.adminToken, ADMIN_TOKEN_STORAGE_KEY);
    } else if (!response.elevated) {
      // Expired
      writeToken(null, ADMIN_TOKEN_STORAGE_KEY);
    }
    setLoginError(null);
    setUserLevel(response.level ?? '');
    setElevated(response.elevated === true);
    setElevatedUntil(response.elevatedUntil ? Date.parse(response.elevatedUntil) : undefined);
    if (response.platform) setPlatform(response.platform);
    if (response.capabilities) setCapabilities(response.capabilities);
    setAuthState('authenticated');
    readyRef.current = true;

    for (const json of queuedRef.current.values()) {
      sendMessage(json, false);
    }
    queuedRef.current.clear();
    sendSubscription();

    // Data may have changed while disconnected. Not on the first login:
    // the queries' first requests were just sent. Requests just sent from
    // the queue are kept, not cancelled and sent again.
    if (wasAuthenticatedRef.current) {
      queryClient.invalidateQueries(undefined, { cancelRefetch: false });
    }
    wasAuthenticatedRef.current = true;
  };

  // Authenticate first on every (re)connect; the server rejects everything else
  // biome-ignore lint/correctness/useExhaustiveDependencies: authAttempt: a retry sends auth again
  useEffect(() => {
    if (readyState === ReadyState.OPEN) {
      // Without a token the answer will be "log in"; don't flash the app meanwhile
      setAuthState((prev) => (prev === 'loginRequired' && !readToken() ? prev : 'pending'));
      sendMessage(
        JSON.stringify({
          type: 'auth',
          token: readToken() ?? undefined,
          adminToken: readToken(ADMIN_TOKEN_STORAGE_KEY) ?? undefined,
          noAutoLogin: loggedOut() || undefined,
        }),
        false,
      );
    } else {
      readyRef.current = false;
      clearTimeout(authRetryRef.current);
      // Requests already sent get no answer on a lost connection: fail them
      // now instead of after their timeout (queries retry once reconnected).
      // Those still queued are sent after the next login.
      for (const [requestId, pending] of pendingRequestsRef.current) {
        if (queuedRef.current.has(requestId)) continue;
        clearTimeout(pending.timeout);
        pendingRequestsRef.current.delete(requestId);
        pending.reject(new RequestError('connection lost', 'NOT_CONNECTED'));
      }
    }
  }, [readyState, sendMessage, authAttempt]);

  useEffect(() => () => clearTimeout(authRetryRef.current), []);

  const login = useCallback(
    (username: string, password: string) => {
      setLoginError(null);
      setLoggedOut(false);
      sendMessage(JSON.stringify({ type: 'login', username, password }), false);
    },
    [sendMessage],
  );

  // Enter the password again to change settings; rejects with the error
  // code (INVALID_CREDENTIALS, TOO_MANY_ATTEMPTS, ...)
  const elevate = useCallback(
    async (password: string) => {
      const response = await request({ type: 'elevate', password }, { queue: false });
      if (response.adminToken) {
        writeToken(response.adminToken, ADMIN_TOKEN_STORAGE_KEY);
      }
      setElevated(true);
      setElevatedUntil(response.elevatedUntil ? Date.parse(response.elevatedUntil) : undefined);
    },
    [request],
  );

  // Gives up the admin rights before they expire; the server makes the
  // admin token useless, so a copy of it can't change settings either
  const endElevation = useCallback(async () => {
    await request({ type: 'endElevation' }, { queue: false });
    writeToken(null, ADMIN_TOKEN_STORAGE_KEY);
    setElevated(false);
    setElevatedUntil(undefined);
  }, [request]);

  // Shown as not elevated once the admin token expires
  useEffect(() => {
    if (!elevated || elevatedUntil === undefined) return;
    const timer = setTimeout(() => setElevated(false), Math.max(0, elevatedUntil - Date.now()));
    return () => clearTimeout(timer);
  }, [elevated, elevatedUntil]);

  const logout = useCallback(async () => {
    // Revoke the token on the server, so a copy of it is useless too
    await request({ type: 'logout' }, { queue: false, timeoutMs: 3000 }).catch(() => {});
    writeToken(null);
    writeToken(null, ADMIN_TOKEN_STORAGE_KEY);
    // Show the login instead of logging in automatically again
    setLoggedOut(true);
    setElevated(false);
    readyRef.current = false;
    setAuthState('loginRequired');
    // A fresh connection, without the subscriptions of the old session
    getWebSocket()?.close();
  }, [getWebSocket, request]);

  const connectionStatus = {
    [ReadyState.CONNECTING]: 'Connecting',
    [ReadyState.OPEN]: 'Open',
    [ReadyState.CLOSING]: 'Closing',
    [ReadyState.CLOSED]: 'Closed',
    [ReadyState.UNINSTANTIATED]: 'Uninstantiated',
  }[readyState];

  // All functions are stable, so this object doesn't change on events
  const actions = useMemo(
    () => ({ request, subscribe, addEventListener, recent: recentRef.current, login, logout, elevate, endElevation }),
    [request, subscribe, addEventListener, login, logout, elevate, endElevation],
  );

  const state = useMemo(
    () => ({
      ...actions,
      connectionStatus,
      authState,
      authRequired,
      userLevel,
      elevated,
      elevatedUntil,
      loginError,
      platform,
      capabilities,
    }),
    [
      actions,
      connectionStatus,
      authState,
      authRequired,
      userLevel,
      elevated,
      elevatedUntil,
      loginError,
      platform,
      capabilities,
    ],
  );

  return { actions, state };
};

export type UseWebsocketReturnType = ReturnType<typeof useWebsocket>['state'];
export type WebSocketActions = ReturnType<typeof useWebsocket>['actions'];

// Datapoints that raise or end a service message
const SERVICE_DATAPOINTS = new Set([
  'UNREACH',
  'STICKY_UNREACH',
  'LOW_BAT',
  'LOWBAT',
  'CONFIG_PENDING',
  'UPDATE_PENDING',
  'SABOTAGE',
  'STICKY_SABOTAGE',
  'ERROR_CODE',
  'DUTY_CYCLE',
]);

const WebSocketContext = createContext<UseWebsocketReturnType | undefined>(undefined);

// Separate context for the actions: controls and queries only need these
// and must not re-render when the connection state changes.
const WebSocketActionsContext = createContext<WebSocketActions | undefined>(undefined);

// What the platform has, for the queries: changes only on login. A CCU's
// without a provider.
const CapabilitiesContext = createContext<Capabilities>(CCU_CAPABILITIES);

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
        // A device's status changed. The service messages follow from the
        // server ('serviceMessages', read once for all apps).
        if (SERVICE_DATAPOINTS.has(event.datapoint)) {
          queryClient.invalidateQueries({ queryKey: ['deviceProblems'] });
        }
      }),
    [actions, queryClient],
  );

  return (
    <WebSocketActionsContext.Provider value={actions}>
      <CapabilitiesContext.Provider value={state.capabilities}>
        <WebSocketContext.Provider value={state}>{children}</WebSocketContext.Provider>
      </CapabilitiesContext.Provider>
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

export const useCapabilities = () => useContext(CapabilitiesContext);

// The platform the server runs on; a CCU without a provider, as the
// capabilities
export const usePlatform = (): Platform => useContext(WebSocketContext)?.platform ?? 'ccu';

export const useWebSocketActions = () => {
  const context = useContext(WebSocketActionsContext);
  if (context === undefined) {
    throw new Error('useWebSocketActions must be used within a WebSocketProvider');
  }
  return context;
};
