import { Link } from '@tanstack/react-router';
import HomeIcon from '~icons/lucide/house';
import TagIcon from '~icons/lucide/tag';
import ChevronRightIcon from '~icons/lucide/chevron-right';
import { useRooms, useTrades } from '../queries';
import { usePageTitle } from '../contexts/PageTitleContext';
import { m } from '../paraglide/messages';

const linkClass =
  'tile-edge press flex h-16 items-center gap-3 rounded-2xl border bg-card px-4 text-[17px] font-medium hover:bg-accent [&>svg]:shrink-0';

export const Rooms = () => {
  const { data: rooms = [] } = useRooms();
  usePageTitle(m.ROOMS());
  return (
    <ul className="mx-auto grid max-w-[1400px] gap-3 px-4 pt-2 pb-10 sm:px-6 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
      {rooms.map((room) => (
        <li key={room.id}>
          <Link to="/room/$roomId" params={{ roomId: String(room.id) }} className={linkClass}>
            <HomeIcon className="size-5 text-muted-foreground" />
            <span className="flex-1 truncate">{room.name}</span>
            <ChevronRightIcon className="size-4 text-muted-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  );
};

export const Trades = () => {
  const { data: trades = [] } = useTrades();
  usePageTitle(m.TRADES());
  return (
    <ul className="mx-auto grid max-w-[1400px] gap-3 px-4 pt-2 pb-10 sm:px-6 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
      {trades.map((trade) => (
        <li key={trade.id}>
          <Link to="/trade/$tradeId" params={{ tradeId: String(trade.id) }} className={linkClass}>
            <TagIcon className="size-5 text-muted-foreground" />
            <span className="flex-1 truncate">{trade.name}</span>
            <ChevronRightIcon className="size-4 text-muted-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  );
};
