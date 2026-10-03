import { createFileRoute } from '@tanstack/react-router';
import { AllLinks } from '../views/setup/AllLinks';

export const Route = createFileRoute('/setup/links')({
  component: AllLinks,
});
