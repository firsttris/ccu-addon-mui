import { ReactNode, useEffect, useState } from 'react';
import { useChannels, useConfigChange, useRooms, useTrades } from '../../queries';
import { useToast } from '../../contexts/ToastContext';
import { DialogButton } from '../../components/ConfirmDialog';
import { m } from '../../paraglide/messages';

const Row = ({ children }: { children: ReactNode }) => (
  <div className="flex gap-2 items-center flex-wrap my-[6px] mx-0">{children}</div>
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
        <input
          className="[font:inherit] flex-1 min-w-40 py-[6px] px-2 border border-solid border-border rounded-md text-text bg-background"
          aria-label={label} value={draft} onChange={(event) => setDraft(event.target.value)} />
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
  const { data: allChannels } = useChannels({ all: true });
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
      {channels.map((channel) => (
        <div key={channel.address} className="border-t border-border pt-2 mt-2">
          <NameField
            label={`${m.NAME()} ${channel.address}`}
            name={channel.name}
            onRename={(name) => run({ type: 'rename', address: channel.address, name }, m.RENAMED())}
          />
          {[
            { legend: m.ROOMS(), groups: rooms, member: channel.rooms ?? [], list: 'rooms' as const },
            { legend: m.TRADES(), groups: trades, member: channel.trades ?? [], list: 'trades' as const },
          ].map(({ legend, groups, member, list }) => (
            <fieldset
              key={legend}
              aria-label={`${legend} ${channel.address}`}
              className="border-none mt-1 mx-0 mb-3 p-0 flex flex-wrap gap-x-[14px] gap-y-1 text-[14px] [&_legend]:text-[12px] [&_legend]:p-0 [&_legend]:mb-[2px] [&_legend]:text-text-secondary"
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
                  />{' '}
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
