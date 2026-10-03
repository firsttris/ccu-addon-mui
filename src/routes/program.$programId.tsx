import { createFileRoute } from '@tanstack/react-router';
import { ProgramEditor } from '../views/programs/ProgramEditor';
import { SetupShell } from '../views/setup/SetupShell';

export const Route = createFileRoute('/program/$programId')({
  component: () => (
    <SetupShell adminOnly={false}>
      <ProgramEditor />
    </SetupShell>
  ),
});
