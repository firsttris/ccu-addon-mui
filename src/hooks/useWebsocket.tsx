import { ReactNode, useEffect, useState } from "react";
import useWebSocket, { ReadyState } from "react-use-websocket";
import regaGetRoomsScript from './../rega/getRooms.tcl';
import regaGetChannelsScript from './../rega/getChannelsForRoomId.tcl';
import { Channel, HmEvent, Room } from "src/types/types";

interface Response {
  rooms?: Room[];
  channels?: Channel[];
  topic?: string;
}

export const useWebsocket = () => {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);

  const { sendMessage, lastMessage, readyState } = useWebSocket('/addons/red/ws/webapp');

  useEffect(() => {
    if (lastMessage !== null) {
      const response = (lastMessage as Response);
      if(response.rooms) {
        setRooms(response.rooms);
      }
      if(response.channels) {
        setChannels(response.channels);
      }
      if (response.topic) {
        const event = response as unknown as HmEvent;
        const newChannels = channels.map(channel => 
          channel.address === event.channel
            ? {
                ...channel,
                datapoints: {
                  ...channel.datapoints,
                  [event.datapoint]: event.value,
                },
              }
            : channel
        );
        setChannels(newChannels as Channel[]);
      }
    }
  }, [lastMessage]);

  const getRooms = () => {
    sendMessage(regaGetRoomsScript);
  }

  const getChannelsForRoomId = (roomId: number) => {
    regaGetChannelsScript.replace(
      /ROOMID_PLACEHOLDER/g,
      roomId ? roomId.toString() : 'NO_ROOM_ID'
    )
    sendMessage(regaGetChannelsScript);
  };

  const connectionStatus = {
    [ReadyState.CONNECTING]: 'Connecting',
    [ReadyState.OPEN]: 'Open',
    [ReadyState.CLOSING]: 'Closing',
    [ReadyState.CLOSED]: 'Closed',
    [ReadyState.UNINSTANTIATED]: 'Uninstantiated',
  }[readyState];

  return {
    getChannelsForRoomId,
    getRooms,
    channels,
    rooms,
    connectionStatus,
  };
};

export type UseWebsocketReturnType = ReturnType<typeof useWebsocket>;

import React, { createContext, useContext } from "react";

const WebSocketContext = createContext<UseWebsocketReturnType | undefined>(undefined);

export const WebSocketProvider: React.FC<{children: ReactNode}> = ({ children }) => {
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
    throw new Error("useWebSocketContext must be used within a WebSocketProvider");
  }
  return context;
};