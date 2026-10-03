import { ReactNode, useEffect, useState } from 'react';
import { useChannels, useConfigChange, useRooms, useTrades } from '../../queries';
import { useToast } from '../../contexts/ToastContext';
import { DialogButton } from '../../components/ConfirmDialog';
import { PanelSkeleton } from '../../components/ui/skeleton';
import { m } from '../../paraglide/messages';
import { Input } from '../../components/ui/input';
import { NativeSelect } from '../../components/ui/select';

// Channel types shown as a lamp or a plain switch (SwitchControl)
const SWITCH_TYPES = new Set(['SWITCH_VIRTUAL_RECEIVER', 'SWITCH']);

const Row = ({ children }: { children: ReactNode }) => (
  <div className="flex flex-wrap items-center gap-2">{children}</div>
);

const NameField = ({ label, name, onRename }: { label: string; name: string; onRename: (name: string) => void }) => {
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);
  const changed = draft.trim() !== '' && draft !== name;
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (changed) {
          onRename(draft.trim());
        }
      }}
    >
      <Row>
        <Input className="min-w-40 flex-1" aria-label={label} value={draft} onChange={(event) => setDraft(event.target.value)} />
        <DialogButton type="submit" disabled={!changed}>
          {m.RENAME()}
        </DialogButton>
      </Row>
    </form>
  );
};

interface NamesAndRoomsProps {
  deviceAddress: string;
  deviceName: string;
}

// Renaming the device and its channels, and the rooms and trades of each
// channel. Every change is saved right away.
export const NamesAndRooms = ({ deviceAddress, deviceName }: NamesAndRoomsProps) => {
  const { showToast } = useToast();
  const { data: allChannels, isPending: channelsLoading } = useChannels({ all: true });
  const { data: rooms = [] } = useRooms();
  const { data: trades = [] } = useTrades();
  const change = useConfigChange();

  const channels = (allChannels ?? []).filter((c) => c.address.startsWith(`${deviceAddress}:`));

  const run = (variables: Parameters<typeof change.mutate>[0], success?: string) =>
    change.mutate(variables, {
      onSuccess: () => success && showToast(success, 'info'),
      onError: (error) => showToast(`${m.CHANGE_FAILED()}: ${error.message}`),
    });

  return (
    <>
      <NameField
        label={`${m.NAME()} ${deviceAddress}`}
        name={deviceName}
        onRename={(name) => run({ type: 'rename', address: deviceAddress, name }, m.RENAMED())}
      />
      {channelsLoading && <PanelSkeleton lines={3} className="border-t pt-3" />}
      {channels.map((channel) => (
        <div key={channel.address} className="flex flex-col gap-2 border-t pt-3">
          <NameField
            label={`${m.NAME()} ${channel.address}`}
            name={channel.name}
            onRename={(name) => run({ type: 'rename', address: channel.address, name }, m.RENAMED())}
          />
          {SWITCH_TYPES.has(channel.type) && (
            <label className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-xs text-muted-foreground">{m.TILE()}</span>
              <NativeSelect
                className="h-8 w-auto md:text-[13px]"
                aria-label={`${m.TILE()} ${channel.address}`}
                value={channel.tile ?? ''}
                onChange={(event) =>
                  run({ type: 'setChannelTile', id: channel.id, tile: event.target.value as '' | 'light' | 'switch' }, m.SAVED())
                }
              >
                <option value="">{m.TILE_AUTO()}</option>
                <option value="light">{m.TILE_LIGHT()}</option>
                <option value="switch">{m.TILE_SWITCH()}</option>
              </NativeSelect>
            </label>
          )}
          <fieldset
            aria-label={`${m.CHANNEL_OPTIONS()} ${channel.address}`}
            className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm [&_label]:flex [&_label]:items-center [&_label]:gap-1.5 [&_legend]:mb-1 [&_legend]:text-xs [&_legend]:text-muted-foreground"
          >
            <legend>{m.CHANNEL_OPTIONS()}</legend>
            {[
              { option: 'visible' as const, label: m.CHANNEL_VISIBLE(), checked: !channel.hidden },
              { option: 'usable' as const, label: m.CHANNEL_USABLE(), checked: !channel.readOnly },
              { option: 'logged' as const, label: m.CHANNEL_LOGGED(), checked: !!channel.logged },
              // BidCos only: HmIP always transmits secured (Channel.setMode)
              ...(channel.interfaceName === 'BidCos-RF'
                ? [{ option: 'aes' as const, label: m.CHANNEL_AES(), checked: !!channel.aes }]
                : []),
            ].map(({ option, label, checked }) => (
              <label key={option}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => run({ type: 'setChannelOption', id: channel.id, option, value: event.target.checked })}
                />
                {label}
              </label>
            ))}
          </fieldset>
          {[
            { legend: m.ROOMS(), groups: rooms, member: channel.rooms ?? [], list: 'rooms' as const },
            { legend: m.TRADES(), groups: trades, member: channel.trades ?? [], list: 'trades' as const },
          ].map(({ legend, groups, member, list }) => (
            <fieldset
              key={legend}
              aria-label={`${legend} ${channel.address}`}
              className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm [&_label]:flex [&_label]:items-center [&_label]:gap-1.5 [&_legend]:mb-1 [&_legend]:text-xs [&_legend]:text-muted-foreground"
            >
              <legend>{legend}</legend>
              {groups.map((group) => (
                <label key={group.id}>
                  <input
                    type="checkbox"
                    checked={member.includes(group.id)}
                    onChange={(event) =>
                      run({
                        type: 'setGroupMember',
                        groupId: group.id,
                        channelId: channel.id,
                        member: event.target.checked,
                        list,
                      })
                    }
                  />
                  {group.name}
                </label>
              ))}
            </fieldset>
          ))}
        </div>
      ))}
    </>
  );
};
