import { useNavigate } from '@tanstack/react-router';
import { ListItem } from '../components/ChannelGroup';
import { useTrades } from '../queries';
import { ListItemText } from './Rooms';

export const Trades = () => {
  const navigate = useNavigate();
  const { data: trades = [] } = useTrades();

  return (
    <div className="max-w-[1280px] mx-auto p-4 pt-[60px]">
      <ul className="list-none p-0 m-0">
        {trades.map((trade) => (
          <ListItem
            key={trade.id}
            onClick={() => {
              navigate({
                to: '/trade/$tradeId',
                params: { tradeId: trade.id.toString() },
              });
            }}
          >
            <ListItemText>{trade.name}</ListItemText>
          </ListItem>
        ))}
      </ul>
    </div>
  );
};
