import { createFileRoute } from '@tanstack/react-router';
import { SystemInfo } from '../views/setup/SystemInfo';

export const Route = createFileRoute('/setup/system')({
  component: SystemInfo,
});
