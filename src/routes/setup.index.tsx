import { createFileRoute } from '@tanstack/react-router';
import { Setup } from '../views/setup/Setup';
import { parseDeviceListSearch } from '../views/setup/deviceListSearch';

export const Route = createFileRoute('/setup/')({
  component: Setup,
  validateSearch: parseDeviceListSearch,
});
