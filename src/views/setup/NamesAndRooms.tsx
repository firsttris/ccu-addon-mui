import styled from '@emotion/styled';
import { useEffect, useState } from 'react';
import { useChannels, useConfigChange, useRooms, useTrades } from '../../queries';
import { useToast } from '../../contexts/ToastContext';
import { DialogButton } from '../../components/ConfirmDialog';
import { m } from '../../paraglide/messages';

const Row = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  margin: 6px 0;
`;

const NameInput = styled.input`
  font: inherit;
  flex: 1;
  min-width: 160px;
  padding: 6px 8px;
  border: 1px solid ${(props) => props.theme.colors.border};
  border-radius: 6px;
  color: ${(props) => props.theme.colors.text};
  background: ${(props) => props.theme.colors.background};
`;

const Groups = styled.fieldset`
  border: none;
  margin: 4px 0 12px;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  font-size: 14px;

  legend {
    font-size: 12px;
    padding: 0;
    margin-bottom: 2px;
    color: ${(props) => props.theme.colors.textSecondary};
  }
`;

const ChannelBlock = styled.div`
  border-top: 1px solid ${(props) => props.theme.colors.border};
  padding-top: 8px;
  margin-top: 8px;
`;

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
        <NameInput aria-label={label} value={draft} onChange={(event) => setDraft(event.target.value)} />
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
        <ChannelBlock key={channel.address}>
          <NameField
            label={`${m.NAME()} ${channel.address}`}
            name={channel.name}
            onRename={(name) => run({ type: 'rename', address: channel.address, name }, m.RENAMED())}
          />
          {[
            { legend: m.ROOMS(), groups: rooms, member: channel.rooms ?? [], list: 'rooms' as const },
            { legend: m.TRADES(), groups: trades, member: channel.trades ?? [], list: 'trades' as const },
          ].map(({ legend, groups, member, list }) => (
            <Groups key={legend} aria-label={`${legend} ${channel.address}`}>
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
            </Groups>
          ))}
        </ChannelBlock>
      ))}
    </>
  );
};
