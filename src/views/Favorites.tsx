import { FormEvent, useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import StarIcon from '~icons/lucide/star';
import PlusIcon from '~icons/lucide/plus';
import PencilIcon from '~icons/lucide/pencil';
import { useChannels, useFavoriteChange, useFavorites, useLogicAction, usePrograms, useSysvars } from '../queries';
import { useWebSocketContext } from '../hooks/useWebsocket';
import { useToast } from '../contexts/ToastContext';
import { usePageTitle } from '../contexts/PageTitleContext';
import { Favorite as FavoriteList } from '../types/protocol';
import { Program, Sysvar } from '../types/types';
import { Dashboard, NavTabs } from './Dashboard';
import { Controls, Item, List, Name, SysvarControl } from './Logic';
import { FavoriteEditor } from './FavoriteEditor';
import { DialogButton } from '../components/ConfirmDialog';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { m } from '../paraglide/messages';
import { rememberView } from '../lib/startPage';

// Favorite lists: the CCU user's own lists of channels, system variables
// and programs from any room, as the WebUI's "Favoriten"
// (rega/pages/tabs/favorites.htm, rega/esp/favorites.fn).

export const LAST_FAVORITE_KEY = 'last-favorite';

const remembered = () => {
  try {
    return localStorage.getItem(LAST_FAVORITE_KEY);
  } catch {
    return null;
  }
};

// Anyone but a guest keeps their own lists, as in the WebUI
const useCanEdit = () => useWebSocketContext().userLevel !== 'guest';

// Asks for the name of a new list, creates it and opens it for editing
const NewListDialog = ({ onClose }: { onClose: () => void }) => {
  const [name, setName] = useState('');
  const change = useFavoriteChange();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() === '') return;
    change.mutate(
      { type: 'createFavorite', name: name.trim() },
      {
        onSuccess: (response) => {
          onClose();
          const id = 'id' in response ? response.id : undefined;
          if (id) {
            navigate({ to: '/favorite/$favoriteId', params: { favoriteId: String(id) }, search: { edit: true } });
          }
        },
        onError: (error) => showToast(`${m.CHANGE_FAILED()}: ${error.message}`),
      },
    );
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label={m.NEW_FAVORITE_LIST()}>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{m.NEW_FAVORITE_LIST()}</DialogTitle>
            <DialogDescription className="sr-only">{m.FAVORITE_LIST_NAME()}</DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            aria-label={m.FAVORITE_LIST_NAME()}
            placeholder={m.FAVORITE_LIST_NAME()}
            value={name}
            maxLength={100}
            onChange={(event) => setName(event.target.value)}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {m.CANCEL()}
            </Button>
            <Button type="submit" disabled={name.trim() === '' || change.isPending}>
              {m.ADD()}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const NewListButton = ({ variant = 'outline' }: { variant?: 'outline' | 'default' }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <PlusIcon />
        {m.NEW_FAVORITE_LIST()}
      </Button>
      {open && <NewListDialog onClose={() => setOpen(false)} />}
    </>
  );
};

// /favorites: the list shown last, else the first; without lists, how to
// start one
export const Favorites = () => {
  const { data: favorites, isError } = useFavorites();
  const canEdit = useCanEdit();
  usePageTitle(m.FAVORITES());
  if (!favorites && !isError) {
    return null;
  }
  if (favorites && favorites.length > 0) {
    const list = favorites.find((f) => String(f.id) === remembered()) ?? favorites[0];
    return <Navigate to="/favorite/$favoriteId" params={{ favoriteId: String(list.id) }} replace />;
  }
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-16 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-amber-500/12 text-amber-600 dark:text-amber-300 [&_svg]:size-7">
        <StarIcon />
      </span>
      <h2 className="text-xl font-semibold">{m.NO_FAVORITES()}</h2>
      <p className="text-sm text-muted-foreground">{m.FAVORITES_HINT()}</p>
      {canEdit && <NewListButton variant="default" />}
    </div>
  );
};

// The list's system variables and programs, in list order
const LogicItems = ({ favorite }: { favorite: FavoriteList }) => {
  const { data: sysvars = [] } = useSysvars();
  const { data: programs = [] } = usePrograms();
  const action = useLogicAction();
  const { showToast } = useToast();
  const onError = (error: Error) => showToast(`${m.SET_FAILED()}: ${error.message}`);
  const rows = favorite.items.flatMap((item): { key: number; sysvar?: Sysvar; program?: Program }[] => {
    if (item.type === 'SYSVAR') {
      const sysvar = sysvars.find((sv) => sv.id === item.id);
      return sysvar ? [{ key: item.id, sysvar }] : [];
    }
    if (item.type === 'PROGRAM') {
      const program = programs.find((p) => p.id === item.id);
      return program ? [{ key: item.id, program }] : [];
    }
    return [];
  });
  if (rows.length === 0) {
    return null;
  }
  return (
    <section aria-labelledby="section-logic" className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2">
        <h2 id="section-logic" className="text-[19px] font-semibold tracking-tight">
          {m.SECTION_LOGIC()}
        </h2>
        <span className="text-sm text-muted-foreground">{rows.length}</span>
      </div>
      <div className="max-w-3xl">
        <List aria-label={m.SECTION_LOGIC()}>
          {rows.map(({ key, sysvar, program }) => (
            <Item key={key}>
              <Name>{sysvar?.name ?? program?.name}</Name>
              <Controls>
                {sysvar && (
                  <SysvarControl
                    sysvar={sysvar}
                    onSet={(value) => action.mutate({ type: 'setSysvar', id: sysvar.id, value }, { onError })}
                  />
                )}
                {program && (
                  <DialogButton
                    type="button"
                    aria-label={`${m.RUN()} ${program.name}`}
                    onClick={() =>
                      action.mutate(
                        { type: 'runProgram', id: program.id },
                        { onSuccess: () => showToast(m.PROGRAM_RUN(), 'info'), onError },
                      )
                    }
                  >
                    {m.RUN()}
                  </DialogButton>
                )}
              </Controls>
            </Item>
          ))}
        </List>
      </div>
    </section>
  );
};

// /favorite/$favoriteId: one list with the room view's tiles
export const Favorite = () => {
  const { favoriteId } = useParams({ from: '/favorite/$favoriteId' });
  const { data: favorites } = useFavorites();
  const favorite = favorites?.find((f) => String(f.id) === favoriteId);
  const { channelsByType, isLoading } = useChannels({ favoriteId });
  const canEdit = useCanEdit();
  const { edit } = useSearch({ from: '/favorite/$favoriteId' });
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  // A new list opens with its editor (?edit)
  const isEditing = editing || edit === true;
  const closeEditor = () => {
    setEditing(false);
    if (edit) navigate({ to: '/favorite/$favoriteId', params: { favoriteId }, search: {}, replace: true });
  };
  usePageTitle(favorite?.name ?? m.FAVORITES());

  useEffect(() => {
    try {
      localStorage.setItem(LAST_FAVORITE_KEY, favoriteId);
    } catch {
      // Private mode: start with the first list
    }
    rememberView({ kind: 'favorite', id: favoriteId });
  }, [favoriteId]);

  // Deleted, or not one of this user's lists
  if (favorites && !favorite) {
    return <Navigate to="/favorites" replace />;
  }
  const hasLogic = favorite?.items.some((item) => item.type === 'SYSVAR' || item.type === 'PROGRAM');
  return (
    <>
      <Dashboard
        tabs={
          // On phones the buttons get their own row, the tabs keep the width
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <NavTabs label={m.FAVORITES()} items={favorites ?? []} activeId={favoriteId} to="/favorite/$favoriteId" />
            </div>
            {canEdit && (
              <div className="flex justify-end gap-2">
                <NewListButton />
                <Button variant="outline" onClick={() => setEditing(true)}>
                  <PencilIcon />
                  {m.EDIT()}
                </Button>
              </div>
            )}
          </div>
        }
        layoutId={favorite?.id}
        channelsByType={channelsByType}
        isLoading={isLoading || !favorites}
        extra={favorite && hasLogic ? <LogicItems favorite={favorite} /> : undefined}
        empty={m.FAVORITE_EMPTY()}
      />
      {favorite && isEditing && <FavoriteEditor favorite={favorite} onClose={closeEditor} />}
    </>
  );
};
