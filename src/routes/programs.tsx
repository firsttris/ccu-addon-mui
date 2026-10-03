import { createFileRoute } from '@tanstack/react-router';
import { Programs } from '../views/Logic';
import { SetupShell } from '../views/setup/SetupShell';

// In the setup frame like the other pages of its side menu, so the menu
// stays in place when switching pages
export const Route = createFileRoute('/programs')({
  component: () => (
    <SetupShell adminOnly={false}>
      <Programs />
    </SetupShell>
  ),
});
