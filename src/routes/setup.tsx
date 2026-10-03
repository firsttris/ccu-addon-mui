import { createFileRoute, Outlet } from '@tanstack/react-router';
import { SetupShell } from '../views/setup/SetupShell';

export const Route = createFileRoute('/setup')({
  component: () => (
    <SetupShell>
      <Outlet />
    </SetupShell>
  ),
});
