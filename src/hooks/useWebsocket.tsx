import { ReactNode, useEffect, useState, useCallback } from 'react';
import useWebSocket, { ReadyState } from 'react-use-websocket';
import regaGetRoomsScript from './../rega/getRooms.tcl';
import regaGetChannelsScript from './../rega/getChannelsForRoomId.tcl';
import regaGetTradesScript from './../rega/getTrades.tcl';
import regaGetChannelsForTradeScript from './../rega/getChannelsForTradeId.tcl';
import getSetDataPoint from './../rega/setDatapoint.tcl';
import { Channel, HmEvent, Room, Trade } from 'src/types/types';

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
    const script = regaGetRoomsScript.replace(
      /DEVICEID_PLACEHOLDER/g,
      deviceId,
    );
    sendMessage(script);
  }, [deviceId, sendMessage]);

  const getTrades = useCallback(() => {
    const script = regaGetTradesScript.replace(
      /DEVICEID_PLACEHOLDER/g,
      deviceId,
    );
    sendMessage(script);
  }, [deviceId, sendMessage]);

  const getChannelsForRoomId = useCallback(
    (roomId: number) => {
      const script = regaGetChannelsScript
        .replace(/ROOMID_PLACEHOLDER/g, roomId.toString())
        .replace(/DEVICEID_PLACEHOLDER/g, deviceId);
      sendMessage(script);
    },
    [deviceId, sendMessage],
  );

  const getChannelsForTrade = useCallback(
    (tradeId: number) => {
      const script = regaGetChannelsForTradeScript
        .replace(/TRADEID_PLACEHOLDER/g, tradeId.toString())
        .replace(/DEVICEID_PLACEHOLDER/g, deviceId);
      sendMessage(script);
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
      const script = getSetDataPoint
        .replace(/INTERFACE_PLACEHOLDER/g, interfaceName)
        .replace(/ADDRESS_PLACEHOLDER/g, address)
        .replace(/ATTRIBUTE_PLACEHOLDER/g, attributeName)
        .replace(/VALUE_PLACEHOLDER/g, value.toString());
      sendMessage(script);
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
