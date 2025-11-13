import { createFileRoute } from '@tanstack/react-router';
import { Trades } from '../views/Trades';

export const Route = createFileRoute('/trades')({
  component: Trades,
});
