import { useEffect, useState } from "react";
import useWebSocket, { ReadyState } from "react-use-websocket";
import regaGetRoomsScript from './../rega/getRooms.tcl';
import regaGetChannelsScript from './../rega/getChannelsForRoomId.tcl';

export const useWebsocket = () => {

  const [messageHistory, setMessageHistory] = useState<MessageEvent<any>[]>([]);

  const { sendMessage, lastMessage, readyState } = useWebSocket('/addons/red/ws/webapp');

  useEffect(() => {
    if (lastMessage !== null) {
        console.log('Received message:', lastMessage);
      setMessageHistory((prev) => prev.concat(lastMessage));
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
        connectionStatus,
        messageHistory,
    };
}