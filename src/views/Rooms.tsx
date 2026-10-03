import { useNavigate } from '@tanstack/react-router';
import { ListItem } from '../components/ChannelGroup';
import { useRooms } from '../queries';
import TeenyiconsFloorplanSolid from '~icons/teenyicons/floorplan-solid';

export const ListItemText = ({ children }: { children: React.ReactNode }) => (
  <p className="text-text max-w-[300px] overflow-hidden whitespace-nowrap text-ellipsis font-semibold my-[10px] mr-0 ml-5 text-[20px]">
    {children}
  </p>
);

export const Rooms = () => {
  const navigate = useNavigate();
  const { data: rooms = [] } = useRooms();

  return (
    <div className="max-w-[1280px] mx-auto p-4 pt-[60px]">
      <ul className="list-none p-0 m-0">
        {rooms.map((room) => (
          <ListItem
            key={room.id}
            onClick={() => {
              navigate({
                to: '/room/$roomId',
                params: { roomId: String(room.id) },
              });
            }}
          >
            <TeenyiconsFloorplanSolid width={35} />
            <ListItemText>{room.name}</ListItemText>
          </ListItem>
        ))}
      </ul>
    </div>
  );
};
