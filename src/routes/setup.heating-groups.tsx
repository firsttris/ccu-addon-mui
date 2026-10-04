import { createFileRoute } from '@tanstack/react-router';
import { HeatingGroups } from '../views/setup/HeatingGroups';

export const Route = createFileRoute('/setup/heating-groups')({
  component: HeatingGroups,
});
