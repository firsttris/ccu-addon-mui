import { createFileRoute } from '@tanstack/react-router';
import { Rules } from '../views/rules/Rules';
import { SetupShell } from '../views/setup/SetupShell';

// Everyone sees the rules; administrators change them
export const Route = createFileRoute('/rules')({
  component: () => (
    <SetupShell adminOnly={false}>
      <Rules />
    </SetupShell>
  ),
});
