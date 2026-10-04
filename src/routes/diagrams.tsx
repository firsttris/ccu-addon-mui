import { createFileRoute } from '@tanstack/react-router';
import { Diagrams } from '../views/diagrams/Diagrams';
import { SetupShell } from '../views/setup/SetupShell';

// Open to everyone logged in, like the WebUI's Status und Bedienung
export const Route = createFileRoute('/diagrams')({
  component: () => (
    <SetupShell adminOnly={false}>
      <Diagrams />
    </SetupShell>
  ),
});
