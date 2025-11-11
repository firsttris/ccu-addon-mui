import { createFileRoute } from '@tanstack/react-router';
import { Room } from '../views/Room';

export const Route = createFileRoute('/room/$roomId')({
  component: Room,
});
