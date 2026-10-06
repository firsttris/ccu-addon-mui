import { useChannels } from '../queries';
import { usePageTitle } from '../contexts/PageTitleContext';
import { Dashboard } from './Dashboard';
import { m } from '../paraglide/messages';

// All devices, also those not assigned to a room or trade
export const AllDevices = () => {
  const { channelsByType, isLoading, error, refetch } = useChannels({ all: true });
  usePageTitle(m.ALL_DEVICES());
  return <Dashboard channelsByType={channelsByType} isLoading={isLoading} error={error} onRetry={() => refetch()} />;
};
