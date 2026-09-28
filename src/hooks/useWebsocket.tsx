import {
  ReactNode,
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import useWebSocket, { ReadyState } from 'react-use-websocket';
import { Channel, ChannelType, HmEvent, Room, Trade } from './../types/types';

import React, { createContext, useContext } from 'react';
import { useUniqueDeviceID } from './useUniqueDeviceID';

interface Response {
  type?: 'subscribe_response' | 'error';
  error?: string;
  rooms?: Room[];
  trades?: Trade[];
  channels?: Channel[];
  roomId?: string;
  tradeId?: string;
  event?: HmEvent;
  deviceId?: string;
  success?: boolean;
}

type ChannelRequest = { roomId: string } | { tradeId: string };

const typeOrder: Partial<Record<ChannelType, number>> = {
  [ChannelType.CLIMATECONTROL_FLOOR_TRANSCEIVER]: 1,
  [ChannelType.HEATING_CLIMATECONTROL_TRANSCEIVER]: 2,
  [ChannelType.SWITCH_VIRTUAL_RECEIVER]: 3,
  [ChannelType.BLIND_VIRTUAL_RECEIVER]: 4,
  [ChannelType.KEYMATIC]: 5,
  [ChannelType.KEY_TRANSCEIVER]: 6,
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

  const deviceId = useUniqueDeviceID();

  // The room or trade currently shown. It is (re)sent whenever the
  // connection opens, so the values are fresh again after a reconnect.
  const channelRequestRef = useRef<ChannelRequest | null>(null);

  const sortedChannelsByType = useMemo(() => {
    const channelsPerType = channels.reduce((acc, channel) => {
      const channels = acc.get(channel.type);
      if (channels) {
        channels.push(channel);
      } else {
        acc.set(channel.type, [channel]);
      }
      return acc;
    }, new Map<ChannelType, Channel[]>());

    return Array.from(channelsPerType).sort(([typeA], [typeB]) => {
      const orderA = typeOrder[typeA] ?? 999;
      const orderB = typeOrder[typeB] ?? 999;
      return orderA - orderB;
    });
  }, [channels]);

  const updateChannels = useCallback((event: HmEvent) => {
    // BidCos devices call it LOWBAT, HmIP devices LOW_BAT
    const statusType = event.datapoint === 'LOWBAT' ? 'LOW_BAT' : event.datapoint;
    const isStatusEvent = statusType === 'LOW_BAT' || statusType === 'UNREACH';

    setChannels((prevChannels) => {
      let changed = false;
      const nextChannels = prevChannels.map((channel) => {
        if (channel.address === event.channel) {
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
  }, []);

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

      if (response.type === 'error') {
        console.error('WebSocket server error:', response.error);
        return;
      }

      // Acknowledgements of subscribe and setDatapoint. A subscribe_response
      // also carries a "channels" list (the subscribed addresses), which must
      // not be taken for channel data.
      if (response.type === 'subscribe_response' || response.success !== undefined) {
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
        // Ignore a late response for a room or trade that is no longer shown
        const current = channelRequestRef.current;
        const isStale =
          (response.roomId !== undefined || response.tradeId !== undefined) &&
          (current === null ||
            ('roomId' in current
              ? current.roomId !== response.roomId
              : current.tradeId !== response.tradeId));
        if (!isStale) {
          setChannels(response.channels);
        }
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  };

  const { sendMessage, readyState } = useWebSocket(wsUrl, {
    shouldReconnect: () => true,
    onMessage: handleMessage,
    // Messages are handled in onMessage; don't store them as lastMessage,
    // which would re-render on every message.
    filter: () => false,
  });

  const sendChannelRequest = useCallback(() => {
    if (channelRequestRef.current) {
      // Not queued while disconnected: the effect below sends it on open.
      sendMessage(
        JSON.stringify({
          type: 'getChannels',
          deviceId,
          ...channelRequestRef.current,
        }),
        false,
      );
    }
  }, [deviceId, sendMessage]);

  useEffect(() => {
    if (readyState === ReadyState.OPEN) {
      sendChannelRequest();
    }
  }, [readyState, sendChannelRequest]);

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
    if (readyState === ReadyState.OPEN && channelAddressesKey !== '') {
      const channelAddresses = channelAddressesKey.split('\n');
      sendMessage(
        JSON.stringify({
          type: 'subscribe',
          deviceId: deviceId,
          channels: channelAddresses,
        }),
      );
      console.log(
        `📝 Device ${deviceId} subscribed to ${channelAddresses.length} channels`,
      );
    }
  }, [channelAddressesKey, readyState, deviceId, sendMessage]);

  const getRooms = useCallback(() => {
    sendMessage(
      JSON.stringify({
        type: 'getRooms',
        deviceId: deviceId,
      }),
    );
  }, [deviceId, sendMessage]);

  const getTrades = useCallback(() => {
    sendMessage(
      JSON.stringify({
        type: 'getTrades',
        deviceId: deviceId,
      }),
    );
  }, [deviceId, sendMessage]);

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

  const setDataPoint = useCallback(
    (
      interfaceName: string,
      address: string,
      attributeName: string,
      value: string | number | boolean,
    ) => {
      sendMessage(
        JSON.stringify({
          type: 'setDatapoint',
          interfaceName: interfaceName,
          address: address,
          attribute: attributeName,
          value: value,
        }),
      );
      updateChannels({ channel: address, datapoint: attributeName, value });
    },
    [sendMessage, updateChannels],
  );

  const connectionStatus = {
    [ReadyState.CONNECTING]: 'Connecting',
    [ReadyState.OPEN]: 'Open',
    [ReadyState.CLOSING]: 'Closing',
    [ReadyState.CLOSED]: 'Closed',
    [ReadyState.UNINSTANTIATED]: 'Uninstantiated',
  }[readyState];

  // All functions are stable, so this object only changes on reconnect
  const actions = useMemo(
    () => ({
      setDataPoint,
      getChannelsForRoomId,
      getChannelsForTrade,
      getRooms,
      getTrades,
    }),
    [setDataPoint, getChannelsForRoomId, getChannelsForTrade, getRooms, getTrades],
  );

  const state = useMemo(
    () => ({
      ...actions,
      channels,
      sortedChannelsByType,
      rooms,
      trades,
      connectionStatus,
    }),
    [actions, channels, sortedChannelsByType, rooms, trades, connectionStatus],
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
