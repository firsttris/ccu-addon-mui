import { createFileRoute } from '@tanstack/react-router';
import { Trades } from '../views/Rooms';

export const Route = createFileRoute('/trades')({
  component: Trades,
});
