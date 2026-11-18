import { type ReactNode, useEffect, useState } from 'react';
import XIcon from '~icons/lucide/x';
import { useConfigChange, useRooms, useTrades } from '../../queries';
import { useToast } from '../../contexts/ToastContext';
import { DialogButton } from '../../components/ConfirmDialog';
import { m } from '../../paraglide/messages';
import { Input } from '../../components/ui/input';
import { NativeSelect } from '../../components/ui/select';
import type { Channel } from '../../types/protocol';
import { errorText } from '../../lib/errors';
import { useWebSocketContext } from '../../hooks/useWebsocket';

type TileChoice = { value: '' | NonNullable<Channel['tile']>; label: () => string };

// The tiles a channel can be shown as, by channel type: a switch as lamp
// or plain switch (SwitchControl), a tilt sensor by its position or as a
// door or flap (TiltSensorControl). The first is the app's own choice.
const switchTiles: TileChoice[] = [
  { value: '', label: m.TILE_AUTO },
  { value: 'light', label: m.TILE_LIGHT },
  { value: 'switch', label: m.TILE_SWITCH },
];
const tiltTiles: TileChoice[] = [
  { value: '', label: m.TILE_TILT_POSITION },
  { value: 'horizontalOpen', label: m.TILE_TILT_HORIZONTAL_OPEN },
  { value: 'horizontalClosed', label: m.TILE_TILT_HORIZONTAL_CLOSED },
];
const tileChoices: Partial<Record<string, { choices: TileChoice[]; hint?: () => string }>> = {
  SWITCH_VIRTUAL_RECEIVER: { choices: switchTiles },
  SWITCH: { choices: switchTiles },
  ACCELERATION_TRANSCEIVER: { choices: tiltTiles, hint: m.TILE_TILT_HINT },
};

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

// A labelled row of the channel's settings: the label beside its controls
const MetaRow = ({ label, children }: { label: string; children: ReactNode }) => (
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
  // The ReGa's channel options; openccu-lite has none
  const { capabilities } = useWebSocketContext();
  const tiles = tileChoices[channel.type];

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
      {/* Given while arranging tiles; the CCU keeps its name above */}
      {channel.displayName && (
        <MetaRow label={m.TILE_NAME_IN_APP()}>
          <span className="text-[13px]">{channel.displayName}</span>
        </MetaRow>
      )}
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
          <MetaRow key={list} label={legend}>
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
          </MetaRow>
        );
      })}
      {tiles && (
        <MetaRow label={m.TILE()}>
          <NativeSelect
            className="h-7 w-auto text-[13px] md:text-[13px]"
            aria-label={`${m.TILE()} ${channel.address}`}
            value={channel.tile ?? ''}
            disabled={!canEdit}
            onChange={(event) =>
              run(
                { type: 'setChannelTile', id: channel.id, tile: event.target.value as TileChoice['value'] },
                m.SAVED(),
              )
            }
          >
            {tiles.choices.map(({ value, label }) => (
              <option key={value} value={value}>
                {label()}
              </option>
            ))}
          </NativeSelect>
          {tiles.hint && <span className="text-xs text-muted-foreground">{tiles.hint()}</span>}
        </MetaRow>
      )}
      {capabilities.channelOptions && (
        <MetaRow label={m.CHANNEL_OPTIONS()}>
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
        </MetaRow>
      )}
    </div>
  );
};
