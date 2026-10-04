import { createFileRoute } from '@tanstack/react-router';
import { DeviceHealth } from '../views/health/DeviceHealth';
import { SetupShell } from '../views/setup/SetupShell';

// Open to everyone logged in, like the service messages it extends
export const Route = createFileRoute('/health')({
  component: () => (
    <SetupShell adminOnly={false}>
      <DeviceHealth />
    </SetupShell>
  ),
});
