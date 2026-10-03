import { createFileRoute } from '@tanstack/react-router';
import { History } from '../views/History';
import { SetupShell } from '../views/setup/SetupShell';

// Open to everyone logged in, like the WebUI's Status und Bedienung
export const Route = createFileRoute('/history')({
  component: () => (
    <SetupShell adminOnly={false}>
      <History />
    </SetupShell>
  ),
});
