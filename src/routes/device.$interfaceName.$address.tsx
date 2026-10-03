import { createFileRoute } from '@tanstack/react-router';
import { DeviceSettings } from '../views/setup/DeviceSettings';

export const Route = createFileRoute('/device/$interfaceName/$address')({
  component: DeviceSettings,
});
