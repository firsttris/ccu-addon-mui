import { createFileRoute } from '@tanstack/react-router';
import { Home } from '../views/Home';

export const Route = createFileRoute('/')({
  component: Home,
});
