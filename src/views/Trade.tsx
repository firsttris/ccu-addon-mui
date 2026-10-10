import { useParams } from '@tanstack/react-router';
import { useChannels, useTrades } from '../queries';
import { usePageTitle } from '../contexts/PageTitleContext';
import { Dashboard } from './Dashboard';
import { NavTabs } from '../components/NavTabs';
import { m } from '../paraglide/messages';

export const Trade: React.FC = () => {
  const { tradeId } = useParams({ from: '/trade/$tradeId' });
  const { data: trades = [] } = useTrades();
  const { channelsByType, isLoading, error, refetch } = useChannels({ tradeId });
  usePageTitle(trades.find((trade) => String(trade.id) === tradeId)?.name ?? m.TRADES());

  return (
    <Dashboard
      tabs={<NavTabs label={m.TRADES()} items={trades} activeId={tradeId} to="/trade/$tradeId" />}
      layoutId={Number(tradeId)}
      channelsByType={channelsByType}
      isLoading={isLoading}
      error={error}
      onRetry={() => refetch()}
    />
  );
};
