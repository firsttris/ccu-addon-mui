import { useParams } from '@tanstack/react-router';
import { useChannels, useTrades } from '../queries';
import { usePageTitle } from '../contexts/PageTitleContext';
import { Dashboard, NavTabs } from './Dashboard';
import { m } from '../paraglide/messages';

export const Trade: React.FC = () => {
  const { tradeId } = useParams({ from: '/trade/$tradeId' });
  const { data: trades = [] } = useTrades();
  const { channelsByType, isLoading } = useChannels({ tradeId });
  usePageTitle(trades.find((trade) => String(trade.id) === tradeId)?.name ?? m.TRADES());

  return (
    <Dashboard
      tabs={<NavTabs label={m.TRADES()} items={trades} activeId={tradeId} to="/trade/$tradeId" />}
      layoutId={Number(tradeId)}
      channelsByType={channelsByType}
      isLoading={isLoading}
    />
  );
};
