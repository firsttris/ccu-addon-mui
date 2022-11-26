import { useParams } from "react-router-dom";
import { useApi } from "../hooks/useApi";

export const Room = () => {
    const { roomId, channelIds } = useParams()
    console.log('roomId', roomId)
    const channelIdsList = channelIds?.split(',');
    console.log('channelIds', channelIdsList)

    const response = useApi('Channel.getName', { id: channelIdsList ? channelIdsList[1] : 0 });
    console.log('Channel.getName', response)
    // const response = useApi('Room.get', { id: roomId });

    // console.log('Room', response.data)
    return null;
}