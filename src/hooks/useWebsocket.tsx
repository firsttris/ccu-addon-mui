import {
  ReactNode,
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import useWebSocket, { ReadyState } from 'react-use-websocket';
import {
  Channel,
  ChannelType,
  DeviceProblem,
  HmEvent,
  Room,
  Trade,
  UserLevel,
} from './../types/types';

import React, { createContext, useContext } from 'react';
import { useUniqueDeviceID } from './useUniqueDeviceID';
import { useToast } from '../contexts/ToastContext';
import { useTranslations } from '../i18n/utils';

interface Response {
  type?:
    | 'subscribe_response'
    | 'error'
    | 'auth_response'
    | 'setDatapoint_response'
    | 'deviceProblems';
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
  // setDatapoint_response
  requestId?: string;
  // deviceProblems
  devices?: DeviceProblem[];
}

type ChannelRequest = { roomId: string } | { tradeId: string } | { all: true };

const isSameRequest = (a: ChannelRequest, b: ChannelRequest) =>
  ('roomId' in a && 'roomId' in b && a.roomId === b.roomId) ||
  ('tradeId' in a && 'tradeId' in b && a.tradeId === b.tradeId) ||
  ('all' in a && 'all' in b);

// 'pending' until the server answered the auth message sent on connect
export type AuthState = 'pending' | 'authenticated' | 'loginRequired';

type Value = string | number | boolean;

interface PendingSet {
  address: string;
  attribute: string;
  previous: Value | undefined;
  sent: Value;
  timeout: ReturnType<typeof setTimeout>;
}

// Types with a control come first, in this order; all others follow
// alphabetically and are shown by GenericControl.
const typeOrder: Partial<Record<string, number>> = {
  [ChannelType.CLIMATECONTROL_FLOOR_TRANSCEIVER]: 1,
  [ChannelType.HEATING_CLIMATECONTROL_TRANSCEIVER]: 2,
  [ChannelType.SWITCH_VIRTUAL_RECEIVER]: 3,
  [ChannelType.BLIND_VIRTUAL_RECEIVER]: 4,
  [ChannelType.KEYMATIC]: 5,
  [ChannelType.ENERGIE_METER_TRANSMITTER]: 6,
};

// Channels that only hold configuration, not a state worth showing
const isHiddenChannel = (channel: Channel) =>
  channel.type === 'MAINTENANCE' ||
  channel.type.endsWith('_WEEK_PROFILE') ||
  Object.keys(channel.datapoints).length === 0;

const TOKEN_STORAGE_KEY = 'ccu-addon-mui_AuthToken';
const SET_DATAPOINT_TIMEOUT_MS = 15000;

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
  const [rooms, setRooms] = useState<Room[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [deviceProblems, setDeviceProblems] = useState<DeviceProblem[] | null>(null);
  const [authState, setAuthState] = useState<AuthState>('pending');
  const [authRequired, setAuthRequired] = useState(false);
  const [userLevel, setUserLevel] = useState<UserLevel>('');
  const [loginError, setLoginError] = useState<string | null>(null);

  const deviceId = useUniqueDeviceID();
  const { showToast } = useToast();
  const t = useTranslations();

  // The room or trade currently shown. It is (re)sent whenever the
  // connection is ready, so the values are fresh again after a reconnect.
  const channelRequestRef = useRef<ChannelRequest | null>(null);

  // Requests made before the connection is open and authenticated. Keyed by
  // type, so e.g. several getRooms calls are only sent once.
  const queuedRef = useRef(new Map<string, string>());
  const readyRef = useRef(false);

  const channelsRef = useRef(channels);
  channelsRef.current = channels;

  const pendingSetsRef = useRef(new Map<string, PendingSet>());
  const nextRequestIdRef = useRef(0);

  const sortedChannelsByType = useMemo(() => {
    const channelsPerType = channels.reduce((acc, channel) => {
      if (isHiddenChannel(channel)) {
        return acc;
      }
      const channels = acc.get(channel.type);
      if (channels) {
        channels.push(channel);
      } else {
        acc.set(channel.type, [channel]);
      }
      return acc;
    }, new Map<string, Channel[]>());

    return Array.from(channelsPerType).sort(
      ([typeA], [typeB]) =>
        (typeOrder[typeA] ?? 999) - (typeOrder[typeB] ?? 999) || typeA.localeCompare(typeB),
    );
  }, [channels]);

  const updateChannels = useCallback(
    (event: HmEvent, onlyIfCurrent?: { value: Value }) => {
      // BidCos devices call it LOWBAT, HmIP devices LOW_BAT
      const statusType = event.datapoint === 'LOWBAT' ? 'LOW_BAT' : event.datapoint;
      const isStatusEvent = statusType === 'LOW_BAT' || statusType === 'UNREACH';

      setChannels((prevChannels) => {
        let changed = false;
        const nextChannels = prevChannels.map((channel) => {
          if (channel.address === event.channel) {
            const datapoints = channel.datapoints as Record<string, unknown>;
            // A rollback must not overwrite a value an event brought in since
            if (onlyIfCurrent && datapoints[event.datapoint] !== onlyIfCurrent.value) {
              return channel;
            }
            changed = true;
            return {
              ...channel,
              datapoints: {
                ...channel.datapoints,
                [event.datapoint]: event.value,
              },
            } as Channel;
          }
          // One device's status applies to all of its channels
          if (isStatusEvent && channel.statusAddress === event.channel) {
            changed = true;
            return {
              ...channel,
              status: { ...channel.status, [statusType]: event.value === true },
            };
          }
          return channel;
        });
        return changed ? nextChannels : prevChannels;
      });
    },
    [],
  );

  const failSet = useCallback(
    (requestId: string, message: string) => {
      const pending = pendingSetsRef.current.get(requestId);
      if (!pending) {
        return;
      }
      clearTimeout(pending.timeout);
      pendingSetsRef.current.delete(requestId);
      if (pending.previous !== undefined) {
        updateChannels(
          { channel: pending.address, datapoint: pending.attribute, value: pending.previous },
          { value: pending.sent },
        );
      }
      showToast(message);
    },
    [showToast, updateChannels],
  );

  // Every message is handled here as it arrives. lastMessage would be
  // overwritten when several messages come in before React renders (e.g. a
  // multicall from the CCU with several datapoints), losing all but the last.
  const handleMessage = (message: MessageEvent) => {
    try {
      if (!message.data || message.data.trim() === '') {
        return;
      }

      const response = JSON.parse(message.data) as Response;

      if (response.event) {
        updateChannels(response.event);
        return;
      }

      switch (response.type) {
        case 'auth_response':
          handleAuthResponse(response);
          return;
        case 'setDatapoint_response':
          if (response.requestId) {
            if (response.success) {
              const pending = pendingSetsRef.current.get(response.requestId);
              if (pending) {
                clearTimeout(pending.timeout);
                pendingSetsRef.current.delete(response.requestId);
              }
            } else {
              failSet(
                response.requestId,
                response.code === 'UNREACH' ? t('SET_UNREACH') : t('SET_FAILED'),
              );
            }
          }
          return;
        case 'deviceProblems':
          setDeviceProblems(response.devices ?? []);
          return;
        case 'error':
          if (response.code === 'AUTH_REQUIRED') {
            setAuthState('loginRequired');
            return;
          }
          console.error('WebSocket server error:', response.error);
          showToast(`${t('SERVER_ERROR')}: ${response.error}`);
          return;
        case 'subscribe_response':
          // Also carries a "channels" list (the subscribed addresses), which
          // must not be taken for channel data.
          return;
      }

      if (response.rooms) {
        setRooms(response.rooms);
        return;
      }
      if (response.trades) {
        setTrades(response.trades);
        return;
      }
      if (response.channels) {
        // Ignore a late response for a room, trade or "all devices" that
        // is no longer shown
        const current = channelRequestRef.current;
        const answered: ChannelRequest | null = response.all
          ? { all: true }
          : response.roomId !== undefined
            ? { roomId: response.roomId }
            : response.tradeId !== undefined
              ? { tradeId: response.tradeId }
              : null;
        const isStale =
          answered !== null && (current === null || !isSameRequest(current, answered));
        if (!isStale) {
          setChannels(response.channels);
        }
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

  const sendChannelRequest = useCallback(() => {
    if (channelRequestRef.current && readyRef.current) {
      sendMessage(
        JSON.stringify({ type: 'getChannels', deviceId, ...channelRequestRef.current }),
        false,
      );
    }
  }, [deviceId, sendMessage]);

  // Sends right away when ready, otherwise once logged in
  const send = useCallback(
    (message: { type: string } & Record<string, unknown>) => {
      const json = JSON.stringify(message);
      if (readyRef.current) {
        sendMessage(json, false);
      } else {
        queuedRef.current.set(message.type, json);
      }
    },
    [sendMessage],
  );

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
    sendChannelRequest();
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

  const ready = readyState === ReadyState.OPEN && authState === 'authenticated';

  // Only re-subscribe when channel addresses actually change, not when datapoints update.
  // The maintenance channels are included for battery and reachability events.
  const channelAddressesKey = useMemo(() => {
    const addresses = new Set<string>();
    for (const channel of channels) {
      addresses.add(channel.address);
      if (channel.statusAddress) {
        addresses.add(channel.statusAddress);
      }
    }
    return Array.from(addresses).join('\n');
  }, [channels]);

  useEffect(() => {
    if (ready && channelAddressesKey !== '') {
      const channelAddresses = channelAddressesKey.split('\n');
      sendMessage(
        JSON.stringify({ type: 'subscribe', deviceId, channels: channelAddresses }),
        false,
      );
    }
  }, [channelAddressesKey, ready, deviceId, sendMessage]);

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

  const getRooms = useCallback(() => {
    send({ type: 'getRooms', deviceId });
  }, [deviceId, send]);

  const getTrades = useCallback(() => {
    send({ type: 'getTrades', deviceId });
  }, [deviceId, send]);

  const getDeviceProblems = useCallback(() => {
    send({ type: 'getDeviceProblems' });
  }, [send]);

  const requestChannels = useCallback(
    (request: ChannelRequest) => {
      channelRequestRef.current = request;
      // Don't show the previous room's channels until the response arrives
      setChannels([]);
      sendChannelRequest();
    },
    [sendChannelRequest],
  );

  const getChannelsForRoomId = useCallback(
    (roomId: number) => requestChannels({ roomId: roomId.toString() }),
    [requestChannels],
  );

  const getChannelsForTrade = useCallback(
    (tradeId: number) => requestChannels({ tradeId: tradeId.toString() }),
    [requestChannels],
  );

  const getAllChannels = useCallback(() => requestChannels({ all: true }), [requestChannels]);

  const setDataPoint = useCallback(
    (interfaceName: string, address: string, attributeName: string, value: Value) => {
      if (!readyRef.current) {
        // Commands are not queued: switching a light minutes later would be a surprise
        showToast(t('NOT_CONNECTED'));
        return;
      }

      const requestId = String(nextRequestIdRef.current++);
      const channel = channelsRef.current.find((c) => c.address === address);
      const previous = channel
        ? ((channel.datapoints as Record<string, unknown>)[attributeName] as Value | undefined)
        : undefined;

      pendingSetsRef.current.set(requestId, {
        address,
        attribute: attributeName,
        previous,
        sent: value,
        timeout: setTimeout(() => failSet(requestId, t('SET_TIMEOUT')), SET_DATAPOINT_TIMEOUT_MS),
      });

      sendMessage(
        JSON.stringify({
          type: 'setDatapoint',
          requestId,
          interfaceName,
          address,
          attribute: attributeName,
          value,
        }),
        false,
      );
      // Optimistic: undone by failSet if the CCU reports an error
      updateChannels({ channel: address, datapoint: attributeName, value });
    },
    [sendMessage, updateChannels, failSet, showToast, t],
  );

  const connectionStatus = {
    [ReadyState.CONNECTING]: 'Connecting',
    [ReadyState.OPEN]: 'Open',
    [ReadyState.CLOSING]: 'Closing',
    [ReadyState.CLOSED]: 'Closed',
    [ReadyState.UNINSTANTIATED]: 'Uninstantiated',
  }[readyState];

  // All functions are stable, so this object doesn't change on events
  const actions = useMemo(
    () => ({
      setDataPoint,
      getChannelsForRoomId,
      getChannelsForTrade,
      getAllChannels,
      getRooms,
      getTrades,
      getDeviceProblems,
      login,
      logout,
    }),
    [
      setDataPoint,
      getChannelsForRoomId,
      getChannelsForTrade,
      getAllChannels,
      getRooms,
      getTrades,
      getDeviceProblems,
      login,
      logout,
    ],
  );

  const state = useMemo(
    () => ({
      ...actions,
      channels,
      sortedChannelsByType,
      rooms,
      trades,
      deviceProblems,
      connectionStatus,
      authState,
      authRequired,
      userLevel,
      loginError,
    }),
    [
      actions,
      channels,
      sortedChannelsByType,
      rooms,
      trades,
      deviceProblems,
      connectionStatus,
      authState,
      authRequired,
      userLevel,
      loginError,
    ],
  );

  return { actions, state };
};

export type UseWebsocketReturnType = ReturnType<typeof useWebsocket>['state'];
export type WebSocketActions = ReturnType<typeof useWebsocket>['actions'];

const WebSocketContext = createContext<UseWebsocketReturnType | undefined>(
  undefined,
);

// Separate context for the actions: controls only need setDataPoint and must
// not re-render every time any channel receives an event.
const WebSocketActionsContext = createContext<WebSocketActions | undefined>(
  undefined,
);

export const WebSocketProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const { actions, state } = useWebsocket();

  return (
    <WebSocketActionsContext.Provider value={actions}>
      <WebSocketContext.Provider value={state}>
        {children}
      </WebSocketContext.Provider>
    </WebSocketActionsContext.Provider>
  );
};

export const useWebSocketContext = () => {
  const context = useContext(WebSocketContext);
  if (context === undefined) {
    throw new Error(
      'useWebSocketContext must be used within a WebSocketProvider',
    );
  }
  return context;
};

export const useWebSocketActions = () => {
  const context = useContext(WebSocketActionsContext);
  if (context === undefined) {
    throw new Error(
      'useWebSocketActions must be used within a WebSocketProvider',
    );
  }
  return context;
};
