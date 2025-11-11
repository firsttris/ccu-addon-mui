import { createFileRoute } from '@tanstack/react-router';
import { Rooms } from '../views/Rooms';

export const Route = createFileRoute('/rooms')({
  component: Rooms,
});
