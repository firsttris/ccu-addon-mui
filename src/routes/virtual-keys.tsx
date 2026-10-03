import { createFileRoute } from '@tanstack/react-router';
import { VirtualKeys } from '../views/VirtualKeys';
import { SetupShell } from '../views/setup/SetupShell';

export const Route = createFileRoute('/virtual-keys')({
  component: () => (
    <SetupShell adminOnly={false}>
      <VirtualKeys />
    </SetupShell>
  ),
});
