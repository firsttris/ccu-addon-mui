import { createFileRoute } from '@tanstack/react-router';
import { LanGateways } from '../views/setup/LanGateways';

export const Route = createFileRoute('/setup/gateways')({
  component: LanGateways,
});
