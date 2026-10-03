import { useState } from 'react';
import PlusIcon from '~icons/lucide/plus';
import { useObjectChange, useRooms, useTrades } from '../../queries';
import { useToast } from '../../contexts/ToastContext';
import { usePageTitle } from '../../contexts/PageTitleContext';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EditableName } from '../../components/EditableName';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { ListSkeletonItems } from '../../components/ui/skeleton';
import { Panel } from './Panel';
import { m } from '../../paraglide/messages';

type List = 'rooms' | 'trades';

const GroupList = ({ list, title, placeholder }: { list: List; title: string; placeholder: string }) => {
  const { showToast } = useToast();
  const { data: rooms = [], isPending: roomsLoading } = useRooms();
  const { data: trades = [], isPending: tradesLoading } = useTrades();
  const groups = list === 'rooms' ? rooms : trades;
  const change = useObjectChange();
  const [name, setName] = useState('');
  const [deleting, setDeleting] = useState<{ id: number; name: string } | null>(null);

  const run = (variables: Parameters<typeof change.mutate>[0], success: string, onSuccess?: () => void) =>
    change.mutate(variables, {
      onSuccess: () => {
        showToast(success, 'info');
        onSuccess?.();
      },
      onError: (error) => showToast(`${m.CHANGE_FAILED()}: ${error.message}`),
    });

  return (
    <Panel aria-label={title}>
      <h2>{title}</h2>
      <ul aria-label={title} className="flex flex-col divide-y rounded-lg border">
        {(list === 'rooms' ? roomsLoading : tradesLoading) && <ListSkeletonItems rows={3} />}
        {groups.map((group) => (
          <li key={group.id} className="flex items-center px-3 py-1.5">
            <EditableName
              name={group.name}
              onRename={(newName) => run({ type: 'renameGroup', list, id: group.id, name: newName }, m.RENAMED())}
              onDelete={() => setDeleting(group)}
            />
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim() !== '') {
            run({ type: 'createGroup', list, name: name.trim() }, m.CREATED(), () => setName(''));
          }
        }}
      >
        <Input aria-label={placeholder} placeholder={placeholder} value={name} onChange={(e) => setName(e.target.value)} />
        <Button type="submit" variant="outline" disabled={name.trim() === '' || change.isPending}>
          <PlusIcon />
          {m.ADD()}
        </Button>
      </form>
      {deleting && (
        <ConfirmDialog
          title={m.DELETE_NAMED({ name: deleting.name })}
          confirmLabel={m.DELETE()}
          destructive
          busy={change.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={() =>
            run({ type: 'deleteGroup', list, id: deleting.id }, m.DELETED_OBJECT(), () => setDeleting(null))
          }
        >
          <p>{m.DELETE_GROUP_CONFIRM({ name: deleting.name })}</p>
        </ConfirmDialog>
      )}
    </Panel>
  );
};

// Creating, renaming and deleting rooms and trades
export const Groups = () => {
  usePageTitle(m.SETUP());
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{m.ROOMS_AND_TRADES()}</h1>
        <p className="text-sm text-muted-foreground">{m.ROOMS_AND_TRADES_HINT()}</p>
      </div>
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <GroupList list="rooms" title={m.ROOMS()} placeholder={m.NEW_ROOM()} />
        <GroupList list="trades" title={m.TRADES()} placeholder={m.NEW_TRADE()} />
      </div>
    </>
  );
};
