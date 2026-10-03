import { createFileRoute } from '@tanstack/react-router';
import { Sessions } from '../views/setup/Sessions';

export const Route = createFileRoute('/setup/sessions')({
  component: Sessions,
});
