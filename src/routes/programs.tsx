import { createFileRoute } from '@tanstack/react-router';
import { Programs } from '../views/Logic';

export const Route = createFileRoute('/programs')({
  component: Programs,
});
