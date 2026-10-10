import { createFileRoute } from '@tanstack/react-router';
import { DeviceSettings } from '../views/setup/DeviceSettings';
import { DEVICE_TABS, type DeviceTab } from '../views/setup/deviceTabs';
import { SetupShell } from '../views/setup/SetupShell';

export const Route = createFileRoute('/device/$interfaceName/$address')({
  validateSearch: (search: Record<string, unknown>): { tab?: DeviceTab } =>
    DEVICE_TABS.includes(search.tab as DeviceTab) && search.tab !== 'channels' ? { tab: search.tab as DeviceTab } : {},
  component: () => (
    <SetupShell>
      <DeviceSettings />
    </SetupShell>
  ),
});
