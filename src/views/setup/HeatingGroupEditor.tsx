import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import PlusIcon from '~icons/lucide/plus';
import XIcon from '~icons/lucide/x';
import { useWebSocketActions } from '../../hooks/useWebsocket';
import { usePasswordRetry } from './usePasswordRetry';
import { useToast } from '../../contexts/ToastContext';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Input } from '../../components/ui/input';
import { NativeSelect } from '../../components/ui/select';
import { Switch } from '../../components/ui/switch';
import { Button } from '../../components/ui/button';
import { m } from '../../paraglide/messages';
import { useChannelNames } from './channelNames';
import { useChannelList, useDevices, useRooms } from '../../queries';
import { ChannelPicker } from '../../components/ChannelPicker';
import { DeviceImage } from '../../components/DeviceImage';
import type { Channel } from '../../types/types';
import type { HeatingGroup, HeatingGroupChange } from '../../types/protocol';
import { errorText } from '../../lib/errors';
import { Field } from '../../components/Field';
import { channelOf, deviceAddressOf } from '../../lib/address';

type GroupType = HeatingGroupChange['type'];

const groupTypes: { type: GroupType; label: () => string }[] = [
  { type: 'hmip.heating.group', label: () => 'HomeMatic IP' },
  { type: 'HomeMatic.heating', label: () => 'HomeMatic' },
];

// Creating or changing a heating group, as the WebUI's GroupEditPage.ftl:
// name, type, whether its members may still be operated alone, and the
// thermostats in it. Channels in another group must leave that one first.
export const HeatingGroupEditor = ({ group, onClose }: { group?: HeatingGroup; onClose: () => void }) => {
  const { request } = useWebSocketActions();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const names = useChannelNames();
  const [name, setName] = useState(group?.name ?? '');
  const [type, setType] = useState<GroupType>((group?.type as GroupType) ?? 'hmip.heating.group');
  const [forbid, setForbid] = useState(group?.forbidSingleOperation ?? false);
  const [members, setMembers] = useState<string[]>(group?.members.map((mb) => mb.address) ?? []);
  const [busy, setBusy] = useState(false);
  const password = usePasswordRetry();

  const candidates = useQuery({
    queryKey: ['heatingGroupMembers', type],
    queryFn: async () => (await request({ type: 'getHeatingGroupMembers', groupType: type })).members,
    staleTime: 0,
  });
  const own = new Set(group?.members.map((mb) => mb.address) ?? []);
  const assignable = (candidates.data?.assignable ?? []).filter((c) => !members.includes(c.id));
  // A group's own members count as leftover (they are in a group); here they
  // can be added back
  const removedOwn = [...own].filter((a) => !members.includes(a));
  const leftover = (candidates.data?.leftover ?? []).filter((c) => !own.has(c.id));
  const label = (address: string) => names.get(address) ?? address;
  const addable = [...removedOwn, ...assignable.map((c) => c.id)];
  const [picking, setPicking] = useState(false);

  // The members as channels, for the channel dialog and their pictures;
  // one ReGa doesn't know yet gets a stand-in
  const { data: regaChannels = [] } = useChannelList();
  const { data: devices = [] } = useDevices();
  const { data: rooms = [] } = useRooms();
  const channelByAddress = useMemo(() => {
    const byAddress = new Map(regaChannels.map((c) => [c.address, c]));
    return (address: string, index: number) =>
      byAddress.get(address) ??
      ({ id: -(index + 1), address, name: names.get(address) ?? address, datapoints: {} } as unknown as Channel);
  }, [regaChannels, names]);
  const addableChannels = addable.map(channelByAddress);
  const deviceType = (address: string) => devices.find((d) => d.address === deviceAddressOf(address))?.type;
  const roomsOf = (address: string) =>
    (regaChannels.find((c) => c.address === address)?.rooms ?? [])
      .map((id) => rooms.find((r) => r.id === id)?.name)
      .filter(Boolean)
      .join(', ');
  const valid = name.trim() !== '' && !/["\\]/.test(name);

  const save = () =>
    password.run(
      async (pw) => {
        setBusy(true);
        try {
          await request(
            {
              type: 'saveHeatingGroup',
              group: { id: group?.id ?? 0, name: name.trim(), type, forbidSingleOperation: forbid, members },
              ...(pw !== undefined ? { password: pw } : {}),
            },
            { queue: false, timeoutMs: 30000 },
          );
          showToast(m.HG_SAVED(), 'info');
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['heatingGroups'] }),
            queryClient.invalidateQueries({ queryKey: ['heatingGroupMembers'] }),
            queryClient.invalidateQueries({ queryKey: ['devices'] }),
          ]);
          onClose();
        } finally {
          setBusy(false);
        }
      },
      (error) => showToast(errorText(error, m.CHANGE_FAILED)),
    );

  return (
    <ConfirmDialog
      title={group ? m.HG_EDIT({ name: group.name }) : m.HG_NEW()}
      confirmLabel={m.SAVE()}
      busy={!valid || busy || password.blocked}
      onConfirm={save}
      onCancel={onClose}
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid && !busy && !password.blocked) save();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Field label={m.NAME()}>
            <Input autoFocus={!group} value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label={m.HG_TYPE()}>
            <NativeSelect
              value={type}
              disabled={!!group && group.members.length > 0}
              onChange={(e) => {
                setType(e.target.value as GroupType);
                setMembers([]);
              }}
            >
              {groupTypes.map((t) => (
                <option key={t.type} value={t.type}>
                  {t.label()}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
        <div className="flex items-start justify-between gap-4">
          <label htmlFor="hg-forbid" className="flex flex-col gap-0.5 text-sm">
            {m.HG_FORBID_SINGLE()}
            <span className="text-xs text-muted-foreground">{m.HG_FORBID_HINT()}</span>
          </label>
          <Switch id="hg-forbid" checked={forbid} onCheckedChange={setForbid} />
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm text-muted-foreground">{m.HG_MEMBERS_TITLE()}</legend>
          {members.length === 0 ? (
            <p className="text-xs text-muted-foreground">{m.HG_NO_MEMBERS()}</p>
          ) : (
            <ul className="flex flex-col divide-y rounded-lg border" aria-label={m.HG_MEMBERS_TITLE()}>
              {members.map((address) => (
                <li key={address} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <DeviceImage
                    type={deviceType(address)}
                    size={36}
                    channel={channelOf(address)}
                    className="shrink-0 rounded-md"
                  />
                  <span className="flex min-w-0 flex-1 flex-col leading-tight">
                    <span className="truncate">{label(address)}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {[roomsOf(address), address].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label={m.HG_REMOVE_MEMBER({ name: label(address) })}
                    onClick={() => setMembers((list) => list.filter((a) => a !== address))}
                  >
                    <XIcon />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" disabled={addable.length === 0} onClick={() => setPicking(true)}>
              <PlusIcon />
              {m.HG_ADD_MEMBERS()}
            </Button>
            {candidates.isPending && <span className="text-xs text-muted-foreground">{m.LOADING()}</span>}
            {candidates.isSuccess && addable.length === 0 && (
              <span className="text-xs text-muted-foreground">{m.HG_NO_CANDIDATES()}</span>
            )}
          </div>
          {candidates.isError && (
            <p role="alert" className="text-xs text-destructive">
              {m.HG_CANDIDATES_FAILED({ error: candidates.error.message })}
            </p>
          )}
          {leftover.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {m.HG_LEFTOVER({ names: leftover.map((c) => label(c.id)).join(', ') })}
            </p>
          )}
        </fieldset>
        {password.field}
      </form>
      {picking && (
        <ChannelPicker
          title={m.HG_ADD_MEMBERS()}
          channels={addableChannels}
          chosen={new Set()}
          includeHidden
          confirmLabel={m.HG_ADD_MEMBERS()}
          onConfirm={(ids) => {
            setPicking(false);
            const chosen = addableChannels.filter((c) => ids.includes(c.id)).map((c) => c.address);
            setMembers((list) => [...list, ...chosen.filter((a) => !list.includes(a))]);
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </ConfirmDialog>
  );
};
