import { useState } from 'react';
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
import type { HeatingGroup, HeatingGroupChange } from '../../types/protocol';

type GroupType = HeatingGroupChange['type'];

export const groupTypes: { type: GroupType; label: () => string }[] = [
  { type: 'hmip.heating.group', label: () => 'HomeMatic IP' },
  { type: 'HomeMatic.heating', label: () => 'HomeMatic' },
];

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="flex flex-col gap-1.5 text-sm text-muted-foreground">
    {label}
    {children}
  </label>
);

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
      (error) => showToast(`${m.CHANGE_FAILED()}: ${error.message}`),
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
                <li key={address} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                  <span className="min-w-0 flex-1 truncate">{label(address)}</span>
                  <span className="font-mono text-xs text-muted-foreground">{address}</span>
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
          {(assignable.length > 0 || removedOwn.length > 0) && (
            <ul className="flex flex-col rounded-lg border border-dashed" aria-label={m.HG_ADDABLE()}>
              {[...removedOwn, ...assignable.map((c) => c.id)].map((address) => (
                <li key={address}>
                  <button
                    type="button"
                    aria-label={m.HG_ADD_MEMBER({ name: label(address) })}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent"
                    onClick={() => setMembers((list) => [...list, address])}
                  >
                    <PlusIcon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{label(address)}</span>
                    <span className="font-mono text-xs text-muted-foreground">{address}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {candidates.isPending && <p className="text-xs text-muted-foreground">{m.LOADING()}</p>}
          {leftover.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {m.HG_LEFTOVER({ names: leftover.map((c) => label(c.id)).join(', ') })}
            </p>
          )}
        </fieldset>
        {password.field}
      </form>
    </ConfirmDialog>
  );
};
