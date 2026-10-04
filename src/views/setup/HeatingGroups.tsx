import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import PlusIcon from '~icons/lucide/plus';
import PencilIcon from '~icons/lucide/pencil';
import TrashIcon from '~icons/lucide/trash-2';
import { useWebSocketActions, useWebSocketContext } from '../../hooks/useWebsocket';
import { useToast } from '../../contexts/ToastContext';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { HeatingGroupEditor, usePasswordRetry } from './HeatingGroupEditor';
import type { HeatingGroup } from '../../types/protocol';
import { useDevices } from '../../queries';
import { usePageTitle } from '../../contexts/PageTitleContext';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { ListSkeletonItems } from '../../components/ui/skeleton';
import { m } from '../../paraglide/messages';
import { Panel } from './Panel';
import { useChannelNames } from './channelNames';

// Deleting a group, through the HMServer like the WebUI's GroupListPage.ftl
const DeleteGroup = ({ group, onClose }: { group: HeatingGroup; onClose: () => void }) => {
  const { request } = useWebSocketActions();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const password = usePasswordRetry();
  const remove = () =>
    password.run(
      async (pw) => {
        setBusy(true);
        try {
          await request({ type: 'deleteHeatingGroup', id: group.id, ...(pw !== undefined ? { password: pw } : {}) }, { queue: false, timeoutMs: 30000 });
          showToast(m.HG_DELETED(), 'info');
          await queryClient.invalidateQueries({ queryKey: ['heatingGroups'] });
          onClose();
        } finally {
          setBusy(false);
        }
      },
      (error) => showToast(`${m.CHANGE_FAILED()}: ${error.message}`),
    );
  return (
    <ConfirmDialog title={m.HG_DELETE()} confirmLabel={m.DELETE()} destructive busy={busy || password.blocked} onConfirm={remove} onCancel={onClose}>
      <div className="flex flex-col gap-4">
        <p>{m.HG_DELETE_QUESTION({ name: group.name })}</p>
        {password.field}
      </div>
    </ConfirmDialog>
  );
};

// The heating groups the HMServer keeps in groups.gson, as the WebUI reads
// them (CCU.getHeatingGroupList): members and the group's own device, which
// is operated and set up like any device. Creating, changing and deleting
// them goes through the HMServer as in the WebUI ("Einstellungen ›
// Gruppen", GroupEditPage.ftl).
export const HeatingGroups = () => {
  usePageTitle(m.SETUP());
  const { request } = useWebSocketActions();
  const { elevated } = useWebSocketContext();
  const [editing, setEditing] = useState<HeatingGroup | 'new' | null>(null);
  const [deleting, setDeleting] = useState<HeatingGroup | null>(null);
  const { data: groups, isPending } = useQuery({
    queryKey: ['heatingGroups'],
    queryFn: async () => (await request({ type: 'getHeatingGroups' })).groups,
  });
  const { data: devices = [] } = useDevices();
  const names = useChannelNames();
  const deviceOf = (address: string) => devices.find((d) => d.address === address);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{m.HG_TITLE()}</h1>
          <p className="text-sm text-muted-foreground">{m.HG_HINT()}</p>
        </div>
        {elevated && (
          <Button type="button" onClick={() => setEditing('new')}>
            <PlusIcon />
            {m.HG_NEW()}
          </Button>
        )}
      </div>
      <Panel aria-label={m.HG_TITLE()}>
        <ul aria-label={m.HG_TITLE()} className="flex flex-col divide-y rounded-lg border">
          {isPending && <ListSkeletonItems rows={2} />}
          {groups?.map((group) => {
            const device = group.deviceAddress ? deviceOf(group.deviceAddress) : undefined;
            return (
              <li key={group.id} aria-label={group.name} className="flex flex-col gap-2 px-3 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{group.name}</span>
                  <Badge variant="secondary">{group.type.startsWith('hmip') ? 'HomeMatic IP' : 'HomeMatic'}</Badge>
                  {group.forbidSingleOperation && <Badge variant="outline">{m.HG_FORBID_SINGLE()}</Badge>}
                  {elevated && (
                    <span className="ml-auto flex gap-1">
                      <Button type="button" variant="ghost" size="icon" className="size-8" aria-label={m.HG_EDIT({ name: group.name })} onClick={() => setEditing(group)}>
                        <PencilIcon />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="size-8" aria-label={m.HG_DELETE()} onClick={() => setDeleting(group)}>
                        <TrashIcon />
                      </Button>
                    </span>
                  )}
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">{m.HG_DEVICE()}: </span>
                  {device ? (
                    <Link
                      to="/device/$interfaceName/$address"
                      params={{ interfaceName: device.interfaceName, address: device.address }}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {device.name ?? group.deviceName}
                    </Link>
                  ) : (
                    <span>{group.deviceName || '–'}</span>
                  )}
                </div>
                {group.members.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{m.HG_NO_MEMBERS()}</p>
                ) : (
                  <ul aria-label={m.HG_MEMBERS({ name: group.name })} className="flex flex-col gap-0.5 text-sm">
                    {group.members.map((member) => {
                      const memberDevice = deviceOf(member.address.split(':')[0]);
                      const label = names.get(member.address) ?? member.address;
                      return (
                        <li key={member.address} className="flex flex-wrap items-baseline gap-x-2">
                          {memberDevice ? (
                            <Link
                              to="/device/$interfaceName/$address"
                              params={{ interfaceName: memberDevice.interfaceName, address: memberDevice.address }}
                              className="underline-offset-4 hover:underline"
                            >
                              {label}
                            </Link>
                          ) : (
                            <span>{label}</span>
                          )}
                          <span className="font-mono text-xs text-muted-foreground">{member.address}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
          {!isPending && groups?.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">{m.HG_NONE()}</li>}
        </ul>
      </Panel>
      {editing && <HeatingGroupEditor group={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {deleting && <DeleteGroup group={deleting} onClose={() => setDeleting(null)} />}
    </>
  );
};
