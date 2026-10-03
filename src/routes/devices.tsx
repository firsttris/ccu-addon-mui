import { createFileRoute } from '@tanstack/react-router';
import { AllDevices } from '../views/AllDevices';

export const Route = createFileRoute('/devices')({
  component: AllDevices,
});
