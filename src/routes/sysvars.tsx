import { createFileRoute } from '@tanstack/react-router';
import { Sysvars } from '../views/Logic';
import { SetupShell } from '../views/setup/SetupShell';

// In the setup frame like the other pages of its side menu, so the menu
// stays in place when switching pages
export const Route = createFileRoute('/sysvars')({
  component: () => (
    <SetupShell adminOnly={false}>
      <Sysvars />
    </SetupShell>
  ),
});
