import { useState } from 'react';
import PlusIcon from '~icons/lucide/plus';
import { useChannels, useConfigChange, useObjectChange, useRooms, useTrades } from '../../queries';
import ChevronIcon from '~icons/lucide/chevron-right';
import XIcon from '~icons/lucide/x';
import { ChannelPicker } from '../../components/ChannelPicker';
import { cn } from '../../lib/utils';
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

// The channels of a room or trade, added and removed here as on the
// WebUI's room and trade pages (roomchannels.htm, functionchannels.htm)
const GroupMembers = ({ list, group }: { list: List; group: { id: number; name: string } }) => {
  const { showToast } = useToast();
  const { data: channels = [] } = useChannels({ all: true });
  const change = useConfigChange();
  const [picking, setPicking] = useState(false);
  const isMember = (channel: (typeof channels)[number]) => (channel[list] ?? []).includes(group.id);
  const members = channels.filter(isMember).sort((a, b) => a.name.localeCompare(b.name));

  const set = (channelId: number, member: boolean) =>
    change.mutate(
      { type: 'setGroupMember', groupId: group.id, channelId, member, list },
      { onError: (error) => showToast(`${m.CHANGE_FAILED()}: ${error.message}`) },
    );

  return (
    <div className="flex flex-col gap-2 pt-1 pb-2 pl-7">
      {members.length === 0 ? (
        <p className="text-xs text-muted-foreground">{m.GROUP_NO_CHANNELS()}</p>
      ) : (
        <ul aria-label={m.GROUP_CHANNELS({ name: group.name })} className="flex flex-col gap-0.5 text-sm">
          {members.map((channel) => (
            <li key={channel.id} className="flex items-center justify-between gap-2">
              <span className="min-w-0">
                {channel.name} <span className="font-mono text-xs text-muted-foreground">{channel.address}</span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label={m.GROUP_REMOVE_CHANNEL({ name: channel.name })}
                onClick={() => set(channel.id, false)}
              >
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Button
        type="button"
        variant="outline"
        className="h-8 self-start"
        aria-label={m.GROUP_ADD_CHANNELS_TO({ name: group.name })}
        onClick={() => setPicking(true)}
      >
        <PlusIcon />
        {m.GROUP_ADD_CHANNELS()}
      </Button>
      {picking && (
        <ChannelPicker
          title={m.GROUP_ADD_CHANNELS_TO({ name: group.name })}
          channels={channels}
          chosen={new Set(members.map((c) => c.id))}
          unassigned={{
            label: list === 'rooms' ? m.GROUP_ONLY_WITHOUT_ROOM() : m.GROUP_ONLY_WITHOUT_TRADE(),
            test: (c) => (c[list] ?? []).length === 0,
          }}
          confirmLabel={m.ADD()}
          onConfirm={(ids) => {
            for (const id of ids) set(id, true);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
};

const GroupList = ({ list, title, placeholder }: { list: List; title: string; placeholder: string }) => {
  const { showToast } = useToast();
  const { data: rooms = [], isPending: roomsLoading } = useRooms();
  const { data: trades = [], isPending: tradesLoading } = useTrades();
  const groups = list === 'rooms' ? rooms : trades;
  const change = useObjectChange();
  const [name, setName] = useState('');
  const [deleting, setDeleting] = useState<{ id: number; name: string } | null>(null);
  const [open, setOpen] = useState<number | null>(null);

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
          <li key={group.id} className="flex flex-col px-3 py-1.5">
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 shrink-0"
                aria-expanded={open === group.id}
                aria-label={m.GROUP_CHANNELS({ name: group.name })}
                onClick={() => setOpen(open === group.id ? null : group.id)}
              >
                <ChevronIcon className={cn('transition-transform', open === group.id && 'rotate-90')} />
              </Button>
              <EditableName
                name={group.name}
                onRename={(newName) => run({ type: 'renameGroup', list, id: group.id, name: newName }, m.RENAMED())}
                onDelete={() => setDeleting(group)}
              />
            </div>
            {open === group.id && <GroupMembers list={list} group={group} />}
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

// Creating, renaming and deleting rooms and trades, and their channels
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
