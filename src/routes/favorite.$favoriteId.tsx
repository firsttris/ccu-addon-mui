import { createFileRoute } from '@tanstack/react-router';
import { Favorite } from '../views/Favorites';

export const Route = createFileRoute('/favorite/$favoriteId')({
  component: Favorite,
  // ?edit opens the editor (a list just created)
  validateSearch: (search: Record<string, unknown>): { edit?: boolean } =>
    search.edit === true || search.edit === 'true' ? { edit: true } : {},
});
