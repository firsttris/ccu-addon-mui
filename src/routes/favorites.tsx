import { createFileRoute } from '@tanstack/react-router';
import { Favorites } from '../views/Favorites';

export const Route = createFileRoute('/favorites')({
  component: Favorites,
});
