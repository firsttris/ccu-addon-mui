import { useWebsocket } from './../hooks/useWebsocket';

export const WebSocketDemo = () => {
  
  const {
    getChannelsForRoomId,
    getRooms,
    connectionStatus,
    messageHistory,
} = useWebsocket();

  return (
    <div>
      {connectionStatus}
      {messageHistory.map((message, idx) => (
        <p key={idx}>{message.data}</p>
      ))}
    </div>
  );
};