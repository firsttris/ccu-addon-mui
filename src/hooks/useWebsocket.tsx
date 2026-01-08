import { ReactNode, useEffect, useState, useCallback, useMemo } from 'react';
import useWebSocket, { ReadyState } from 'react-use-websocket';
import { Channel, ChannelType, HmEvent, Room, Trade } from 'src/types/types';

import React, { createContext, useContext } from 'react';
import { useUniqueDeviceID } from './useUniqueDeviceID';

interface Response {
  rooms?: Room[];
  trades?: Trade[];
  channels?: Channel[];
  event?: HmEvent;
  deviceId?: string;
  success?: boolean;
}

export const useWebsocket = () => {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);

  const deviceId = useUniqueDeviceID();

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

    const typeOrder = {
      [ChannelType.CLIMATECONTROL_FLOOR_TRANSCEIVER]: 1,
      [ChannelType.HEATING_CLIMATECONTROL_TRANSCEIVER]: 2,
      [ChannelType.SWITCH_VIRTUAL_RECEIVER]: 3,
      [ChannelType.BLIND_VIRTUAL_RECEIVER]: 4,
    };

    return Array.from(channelsPerType).sort(([typeA], [typeB]) => {
      const orderA = typeOrder[typeA] ?? 999;
      const orderB = typeOrder[typeB] ?? 999;
      return orderA - orderB;
    });
  }, [channels]);

  // Connect to WebSocket server via same host (works in dev and production)
  const wsUrl =
    window.location.protocol === 'https:'
      ? `wss://${window.location.host}/ws/mui`
      : `ws://${window.location.host}/ws/mui`;

  const { sendMessage, lastMessage, readyState } = useWebSocket(wsUrl, {
    shouldReconnect: () => true,
  });

  const updateChannels = (event: HmEvent) => {
    setChannels(
      (prevChannels) =>
        prevChannels.map((channel) =>
          channel.address === event.channel
            ? {
                ...channel,
                datapoints: {
                  ...channel.datapoints,
                  [event.datapoint]: event.value,
                },
              }
            : channel,
        ) as Channel[],
    );
  };

  // Subscribe to channels when they change
  // Only re-subscribe when channel addresses actually change, not when datapoints update
  useEffect(() => {
    if (readyState === ReadyState.OPEN && channels.length > 0) {
      const channelAddresses = channels.map((channel) => channel.address);
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
    // Only depend on the stringified addresses to avoid re-subscribing on datapoint changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(channels.map((c) => c.address)), readyState, deviceId]);

  useEffect(() => {
    if (lastMessage !== null) {
      try {
        if (!lastMessage.data || lastMessage.data.trim() === '') {
          return;
        }

        const response = JSON.parse(lastMessage.data) as Response;

        // Handle events (no deviceId needed)
        if (response.event) {
          updateChannels(response.event);
          return;
        }

        // Handle success responses (no deviceId needed)
        if (response.success !== undefined) {
          return;
        }

        // For rooms, channels and trades, check deviceId
        if (response.rooms || response.channels || response.trades) {
          if (response.deviceId !== deviceId) {
            console.warn(
              'Device ID mismatch! Expected:',
              deviceId,
              'Received:',
              response.deviceId,
            );
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
            setChannels(response.channels);
            return;
          }
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    }
  }, [lastMessage, deviceId]);

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

  const getChannelsForRoomId = useCallback(
    (roomId: number) => {
      sendMessage(
        JSON.stringify({
          type: 'getChannels',
          deviceId: deviceId,
          roomId: roomId.toString(),
        }),
      );
    },
    [deviceId, sendMessage],
  );

  const getChannelsForTrade = useCallback(
    (tradeId: number) => {
      sendMessage(
        JSON.stringify({
          type: 'getChannels',
          deviceId: deviceId,
          tradeId: tradeId.toString(),
        }),
      );
    },
    [deviceId, sendMessage],
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
    [sendMessage],
  );

  const connectionStatus = {
    [ReadyState.CONNECTING]: 'Connecting',
    [ReadyState.OPEN]: 'Open',
    [ReadyState.CLOSING]: 'Closing',
    [ReadyState.CLOSED]: 'Closed',
    [ReadyState.UNINSTANTIATED]: 'Uninstantiated',
  }[readyState];

  return {
    setChannels,
    setDataPoint,
    getChannelsForRoomId,
    getChannelsForTrade,
    getRooms,
    getTrades,
    channels,
    sortedChannelsByType,
    rooms,
    trades,
    connectionStatus,
  };
};

export type UseWebsocketReturnType = ReturnType<typeof useWebsocket>;

const WebSocketContext = createContext<UseWebsocketReturnType | undefined>(
  undefined,
);

export const WebSocketProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const websocket = useWebsocket();

  return (
    <WebSocketContext.Provider value={websocket}>
      {children}
    </WebSocketContext.Provider>
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
