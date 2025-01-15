import { ReactNode, useEffect, useState } from "react";
import useWebSocket, { ReadyState } from "react-use-websocket";
import regaGetRoomsScript from './../rega/getRooms.tcl';
import regaGetChannelsScript from './../rega/getChannelsForRoomId.tcl';
import getSetDataPoint from './../rega/setDatapoint.tcl';
import { Channel, HmEvent, Room } from "src/types/types";

import React, { createContext, useContext } from "react";

interface Response {
  rooms?: Room[];
  channels?: Channel[];
  event?: HmEvent;
}

export const useWebsocket = () => {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);

  const { sendMessage, lastMessage, readyState } = useWebSocket('/addons/red/ws/webapp', { });

  const updateChannels = (event: HmEvent) => {
    setChannels(prevChannels => 
      prevChannels.map(channel => 
        channel.address === event.channel
          ? {
              ...channel,
              datapoints: {
                ...channel.datapoints,
                [event.datapoint]: event.value,
              },
            }
          : channel
      ) as Channel[]
    );
  };

  useEffect(() => {
    if (lastMessage !== null) {
      const response = (JSON.parse(lastMessage.data) as Response);
      if(response.rooms) {
        setRooms(response.rooms);
        return
      }
      if(response.channels) {
        setChannels(response.channels);
        return
      }
      if (response.event) {
        updateChannels(response.event);
      }
    }
  }, [lastMessage]);

  const getRooms = () => {

    sendMessage(regaGetRoomsScript);
  }

  const getChannelsForRoomId = (roomId: number) => {
    const script = regaGetChannelsScript.replace(
      /ROOMID_PLACEHOLDER/g,
      roomId.toString()
    )
    sendMessage(script);
  };

  const setDataPoint = (interfaceName: string, address: string, attributeName: string, value: string | number | boolean ) => {
    const script = getSetDataPoint.replace(
      /INTERFACE_PLACEHOLDER/g,
      interfaceName
    ).replace(
      /ADDRESS_PLACEHOLDER/g,
      address
    ).replace(
      /ATTRIBUTE_PLACEHOLDER/g,
      attributeName
    ).replace(
      /VALUE_PLACEHOLDER/g,
      value.toString()
    )
    sendMessage(script);
    updateChannels({ channel: address, datapoint: attributeName, value });
  };

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
    getRooms,
    channels,
    rooms,
    connectionStatus,
  };
};

export type UseWebsocketReturnType = ReturnType<typeof useWebsocket>;

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