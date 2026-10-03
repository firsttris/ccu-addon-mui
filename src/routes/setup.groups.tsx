import { createFileRoute } from '@tanstack/react-router';
import { Groups } from '../views/setup/Groups';

export const Route = createFileRoute('/setup/groups')({
  component: Groups,
});
