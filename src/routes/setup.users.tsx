import { createFileRoute } from '@tanstack/react-router';
import { Users } from '../views/setup/Users';

export const Route = createFileRoute('/setup/users')({
  component: Users,
});
