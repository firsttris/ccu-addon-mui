import { createFileRoute } from '@tanstack/react-router';
import { Setup } from '../views/setup/Setup';

export const Route = createFileRoute('/setup')({
  component: Setup,
});
