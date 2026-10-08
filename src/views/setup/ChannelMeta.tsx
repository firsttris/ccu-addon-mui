import { ReactNode, useEffect, useState } from 'react';
import XIcon from '~icons/lucide/x';
import { useConfigChange, useRooms, useTrades } from '../../queries';
import { useToast } from '../../contexts/ToastContext';
import { DialogButton } from '../../components/ConfirmDialog';
import { m } from '../../paraglide/messages';
import { Input } from '../../components/ui/input';
import { NativeSelect } from '../../components/ui/select';
import type { Channel } from '../../types/protocol';
import { errorText } from '../../lib/errors';

// Channel types shown as a lamp or a plain switch (SwitchControl)
const SWITCH_TYPES = new Set(['SWITCH_VIRTUAL_RECEIVER', 'SWITCH']);

export const NameField = ({
  label,
  name,
  onRename,
}: {
  label: string;
  name: string;
  onRename: (name: string) => void;
}) => {
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);
  const changed = draft.trim() !== '' && draft !== name;
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (changed) {
          onRename(draft.trim());
        }
      }}
    >
      <Input
        className="min-w-40 flex-1 font-medium"
        aria-label={label}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      {changed && (
        <DialogButton type="submit" primary>
          {m.RENAME()}
        </DialogButton>
      )}
    </form>
  );
};

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="grid items-center gap-x-3 gap-y-1.5 sm:grid-cols-[7rem_minmax(0,1fr)]">
    <span className="text-xs text-muted-foreground">{label}</span>
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">{children}</div>
  </div>
);

// Rename a device or channel; saved right away
export const useRename = () => {
  const { showToast } = useToast();
  const change = useConfigChange();
  return (address: string, name: string) =>
    change.mutate(
      { type: 'rename', address, name },
      {
        onSuccess: () => showToast(m.RENAMED(), 'info'),
        onError: (error) => showToast(errorText(error, m.CHANGE_FAILED)),
      },
    );
};

// What the CCU keeps about a channel besides its settings: options, rooms,
// trades and the tile. Every change is saved right away.
export const ChannelMeta = ({ channel, canEdit }: { channel: Channel; canEdit: boolean }) => {
  const { showToast } = useToast();
  const { data: rooms = [] } = useRooms();
  const { data: trades = [] } = useTrades();
  const change = useConfigChange();

  const run = (variables: Parameters<typeof change.mutate>[0], success?: string) =>
    change.mutate(variables, {
      onSuccess: () => success && showToast(success, 'info'),
      onError: (error) => showToast(errorText(error, m.CHANGE_FAILED)),
    });

  const options = [
    { option: 'visible' as const, label: m.CHANNEL_VISIBLE(), checked: !channel.hidden },
    { option: 'usable' as const, label: m.CHANNEL_USABLE(), checked: !channel.readOnly },
    { option: 'logged' as const, label: m.CHANNEL_LOGGED(), checked: !!channel.logged },
    // BidCos only: HmIP always transmits secured (Channel.setMode)
    ...(channel.interfaceName === 'BidCos-RF'
      ? [{ option: 'aes' as const, label: m.CHANNEL_AES(), checked: !!channel.aes }]
      : []),
  ];

  return (
    <div className="flex flex-col gap-2.5">
      {[
        { legend: m.ROOMS(), add: m.ROOM_ADD(), groups: rooms, member: channel.rooms ?? [], list: 'rooms' as const },
        {
          legend: m.TRADES(),
          add: m.TRADE_ADD(),
          groups: trades,
          member: channel.trades ?? [],
          list: 'trades' as const,
        },
      ].map(({ legend, add, groups, member, list }) => {
        const assigned = groups.filter((group) => member.includes(group.id));
        const others = groups.filter((group) => !member.includes(group.id));
        const set = (groupId: number, value: boolean) =>
          run({ type: 'setGroupMember', groupId, channelId: channel.id, member: value, list });
        return (
          <Field key={list} label={legend}>
            <ul aria-label={`${legend} ${channel.address}`} className="contents">
              {assigned.map((group) => (
                <li
                  key={group.id}
                  className="flex h-7 items-center gap-1 rounded-full border bg-muted/60 pr-1 pl-2.5 text-[13px]"
                >
                  {group.name}
                  {canEdit && (
                    <button
                      type="button"
                      aria-label={m.GROUP_REMOVE_FROM({ name: group.name })}
                      className="grid size-5 place-items-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground"
                      onClick={() => set(group.id, false)}
                    >
                      <XIcon className="size-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {assigned.length === 0 && !canEdit && <span className="text-[13px] text-muted-foreground">–</span>}
            {canEdit && others.length > 0 && (
              <NativeSelect
                className="h-7 w-auto rounded-full border-dashed text-[13px] md:text-[13px]"
                aria-label={`${add} ${channel.address}`}
                value=""
                onChange={(event) => event.target.value && set(Number(event.target.value), true)}
              >
                <option value="">+ {add}</option>
                {others.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
        );
      })}
      {SWITCH_TYPES.has(channel.type) && (
        <Field label={m.TILE()}>
          <NativeSelect
            className="h-7 w-auto text-[13px] md:text-[13px]"
            aria-label={`${m.TILE()} ${channel.address}`}
            value={channel.tile ?? ''}
            disabled={!canEdit}
            onChange={(event) =>
              run(
                { type: 'setChannelTile', id: channel.id, tile: event.target.value as '' | 'light' | 'switch' },
                m.SAVED(),
              )
            }
          >
            <option value="">{m.TILE_AUTO()}</option>
            <option value="light">{m.TILE_LIGHT()}</option>
            <option value="switch">{m.TILE_SWITCH()}</option>
          </NativeSelect>
        </Field>
      )}
      <Field label={m.CHANNEL_OPTIONS()}>
        <fieldset
          aria-label={`${m.CHANNEL_OPTIONS()} ${channel.address}`}
          disabled={!canEdit}
          className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] [&_label]:flex [&_label]:items-center [&_label]:gap-1.5"
        >
          {options.map(({ option, label, checked }) => (
            <label key={option}>
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) =>
                  run({ type: 'setChannelOption', id: channel.id, option, value: event.target.checked })
                }
              />
              {label}
            </label>
          ))}
        </fieldset>
      </Field>
    </div>
  );
};
