import { ReactNode, useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import CpuIcon from '~icons/lucide/cpu';
import BracesIcon from '~icons/lucide/braces';
import PlayIcon from '~icons/lucide/play';
import PlusIcon from '~icons/lucide/plus';
import XIcon from '~icons/lucide/x';
import SearchIcon from '~icons/lucide/search';
import { useChannelList, useFavoriteChange, usePrograms, useRooms, useSysvars } from '../queries';
import { useToast } from '../contexts/ToastContext';
import { Favorite, FavoriteItem } from '../types/protocol';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../components/ui/sheet';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { EditableName } from '../components/EditableName';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { m } from '../paraglide/messages';
import { errorText } from '../lib/errors';

// Edits a favorite list as the WebUI's newFav.htm does: its name, its
// entries (channels, system variables, programs) and deleting it.

interface Entry {
  id: number;
  type: FavoriteItem['type'];
  name: string;
  detail?: string;
}

const icons: Record<string, ReactNode> = { CHANNEL: <CpuIcon />, SYSVAR: <BracesIcon />, PROGRAM: <PlayIcon /> };

const MAX_RESULTS = 50;

const EntryRow = ({ entry, action }: { entry: Entry; action: ReactNode }) => (
  <li className="flex min-h-14 items-center gap-3 px-3 py-2">
    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-4">
      {icons[entry.type]}
    </span>
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="truncate text-[15px] font-medium">{entry.name}</span>
      {entry.detail && <span className="truncate text-xs text-muted-foreground">{entry.detail}</span>}
    </span>
    {action}
  </li>
);

export const FavoriteEditor = ({ favorite, onClose }: { favorite: Favorite; onClose: () => void }) => {
  const { data: channels = [] } = useChannelList();
  const { data: sysvars = [] } = useSysvars();
  const { data: programs = [] } = usePrograms();
  const { data: rooms = [] } = useRooms();
  const change = useFavoriteChange();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Everything that can go into a list, by id
  const entries = useMemo(() => {
    const roomNames = new Map(rooms.map((room) => [room.id, room.name]));
    const all = new Map<number, Entry>();
    for (const channel of channels) {
      const detail = (channel.rooms ?? []).map((id) => roomNames.get(id)).filter(Boolean).join(', ');
      all.set(channel.id, { id: channel.id, type: 'CHANNEL', name: channel.name, detail });
    }
    for (const sysvar of sysvars.filter((sv) => sv.visible)) {
      all.set(sysvar.id, { id: sysvar.id, type: 'SYSVAR', name: sysvar.name, detail: m.SYSVARS() });
    }
    for (const program of programs.filter((p) => p.visible)) {
      all.set(program.id, { id: program.id, type: 'PROGRAM', name: program.name, detail: m.PROGRAMS() });
    }
    return all;
  }, [channels, sysvars, programs, rooms]);

  const inList = favorite.items
    .filter((item) => item.type !== 'SEPARATOR')
    .map((item) => entries.get(item.id) ?? { id: item.id, type: item.type, name: `#${item.id}` });
  const taken = new Set(favorite.items.map((item) => item.id));
  const needle = query.trim().toLocaleLowerCase();
  const candidates = Array.from(entries.values())
    .filter((entry) => !taken.has(entry.id))
    .filter((entry) => needle === '' || `${entry.name} ${entry.detail ?? ''}`.toLocaleLowerCase().includes(needle))
    .sort((a, b) => a.name.localeCompare(b.name));

  const run = (variables: Parameters<typeof change.mutate>[0], onSuccess?: () => void) =>
    change.mutate(variables, {
      onSuccess,
      onError: (error) => showToast(errorText(error, m.CHANGE_FAILED)),
    });

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-[min(480px,96vw)] gap-0 sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{m.EDIT_FAVORITE_LIST()}</SheetTitle>
          <SheetDescription className="sr-only">{favorite.name}</SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pb-6">
          <div className="flex min-h-11 items-center gap-2 rounded-xl border bg-card px-3 text-[17px] font-semibold">
            <EditableName
              name={favorite.name}
              onRename={(name) => run({ type: 'renameFavorite', id: favorite.id, name }, () => showToast(m.RENAMED(), 'info'))}
              onDelete={() => setDeleting(true)}
            />
          </div>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-muted-foreground">
              {m.FAVORITE_ITEMS()} <span className="font-normal">{inList.length}</span>
            </h3>
            <ul aria-label={m.FAVORITE_ITEMS()} className="flex flex-col divide-y rounded-xl border bg-card">
              {inList.map((entry) => (
                <EntryRow
                  key={entry.id}
                  entry={entry}
                  action={
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`${m.REMOVE_FROM_LIST()}: ${entry.name}`}
                      disabled={change.isPending}
                      onClick={() => run({ type: 'removeFavoriteItem', id: favorite.id, itemId: entry.id })}
                    >
                      <XIcon />
                    </Button>
                  }
                />
              ))}
              <li className="hidden px-3 py-6 text-center text-sm text-muted-foreground only:block">{m.EMPTY_LIST()}</li>
            </ul>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-muted-foreground">{m.FAVORITE_ADD_ITEMS()}</h3>
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                aria-label={m.FAVORITE_SEARCH()}
                placeholder={m.FAVORITE_SEARCH()}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="pl-9"
              />
            </div>
            <ul aria-label={m.FAVORITE_ADD_ITEMS()} className="flex flex-col divide-y rounded-xl border bg-card">
              {candidates.slice(0, MAX_RESULTS).map((entry) => (
                <EntryRow
                  key={entry.id}
                  entry={entry}
                  action={
                    <Button
                      size="icon"
                      variant="outline"
                      aria-label={`${m.ADD_TO_LIST()}: ${entry.name}`}
                      disabled={change.isPending}
                      onClick={() => run({ type: 'addFavoriteItem', id: favorite.id, itemId: entry.id })}
                    >
                      <PlusIcon />
                    </Button>
                  }
                />
              ))}
              <li className="hidden px-3 py-6 text-center text-sm text-muted-foreground only:block">{m.NO_RESULTS()}</li>
            </ul>
          </section>
        </div>
      </SheetContent>
      {deleting && (
        <ConfirmDialog
          title={m.DELETE_NAMED({ name: favorite.name })}
          confirmLabel={m.DELETE()}
          destructive
          busy={change.isPending}
          onCancel={() => setDeleting(false)}
          onConfirm={() =>
            run({ type: 'deleteFavorite', id: favorite.id }, () => {
              setDeleting(false);
              onClose();
              navigate({ to: '/favorites' });
            })
          }
        >
          {m.DELETE_FAVORITE_CONFIRM()}
        </ConfirmDialog>
      )}
    </Sheet>
  );
};
