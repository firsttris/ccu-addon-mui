import { createFileRoute } from '@tanstack/react-router';
import { Pairing } from '../views/setup/Pairing';

export const Route = createFileRoute('/setup/pairing')({
  component: Pairing,
});
