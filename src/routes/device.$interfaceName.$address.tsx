import { createFileRoute } from '@tanstack/react-router';
import { DeviceSettings } from '../views/setup/DeviceSettings';
import { SetupShell } from '../views/setup/SetupShell';

export const Route = createFileRoute('/device/$interfaceName/$address')({
  component: () => (
    <SetupShell>
      <DeviceSettings />
    </SetupShell>
  ),
});
