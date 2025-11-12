import { createFileRoute } from '@tanstack/react-router';
import { Trade } from '../views/Trade';

export const Route = createFileRoute('/trade/$tradeName')({
  component: Trade,
});
