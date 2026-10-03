import { createFileRoute } from '@tanstack/react-router';
import { Sysvars } from '../views/Logic';

export const Route = createFileRoute('/sysvars')({
  component: Sysvars,
});
