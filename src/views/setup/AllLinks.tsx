import { useMemo, useState } from 'react';
import { Link as RouterLink } from '@tanstack/react-router';
import SearchIcon from '~icons/lucide/search';
import { useAllLinks, useDevices, useLinkAction } from '../../queries';
import { useToast } from '../../contexts/ToastContext';
import { usePageTitle } from '../../contexts/PageTitleContext';
import { InterfaceLink } from '../../types/protocol';
import { ConfirmDialog, DialogButton } from '../../components/ConfirmDialog';
import { Input } from '../../components/ui/input';
import { ListSkeletonItems } from '../../components/ui/skeleton';
import { NativeSelect } from '../../components/ui/select';
import { useChannelNames } from './channelNames';
import { AddLinkForm, LinkParameters, useLinkChannelInfo } from './Links';
import { m } from '../../paraglide/messages';

// All direct links of the CCU, like the WebUI's "Programme & Verknüpfungen →
// Direkte Verknüpfungen" (config/ic_linkpeerlist.cgi): search, parameters
// with the link profiles, remove, and linking a new pair.
export const AllLinks = () => {
  usePageTitle(m.LINKS());
  const { data: links = [], isLoading } = useAllLinks();
  const { data: devices = [] } = useDevices();
  const names = useChannelNames();
  const channelInfo = useLinkChannelInfo();
  const action = useLinkAction();
  const { showToast } = useToast();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [removing, setRemoving] = useState<InterfaceLink | null>(null);
  const [device, setDevice] = useState('');

  const label = (address: string) => `${names.get(address) ?? address} (${address})`;
  const needle = query.trim().toLocaleLowerCase();
  const shown = links.filter(
    (link) =>
      needle === '' ||
      `${label(link.sender)} ${label(link.receiver)} ${link.name ?? ''}`.toLocaleLowerCase().includes(needle),
  );
  // Devices with channels that can be linked, for a new link
  const linkableDevices = useMemo(
    () =>
      devices
        .filter((d) => (d.channels ?? []).some((c) => c.linkSourceRoles?.length || c.linkTargetRoles?.length))
        .sort((a, b) => (a.name ?? a.address).localeCompare(b.name ?? b.address)),
    [devices],
  );
  const chosen = linkableDevices.find((d) => d.address === device);
  const deviceAddressOf = (address: string) => address.split(':')[0];

  return (
    <div className="flex flex-col gap-5">
      <div className="relative max-w-md">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input type="search" aria-label={m.SEARCH()} placeholder={m.SEARCH()} value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
      </div>

      {!isLoading && shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">{links.length === 0 ? m.NO_LINKS() : m.NO_RESULTS()}</p>
      ) : (
        <ul aria-label={m.LINKS()} className="tile-edge flex flex-col divide-y rounded-2xl border bg-card">
          {isLoading && <ListSkeletonItems rows={4} />}
          {shown.map((link) => {
            const key = `${link.interfaceName}:${link.sender}>${link.receiver}`;
            return (
              <li key={key} className="flex flex-col gap-3 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-[220px] flex-1 text-sm">
                    <RouterLink
                      to="/device/$interfaceName/$address"
                      params={{ interfaceName: link.interfaceName, address: deviceAddressOf(link.sender) }}
                      className="underline-offset-4 hover:underline"
                    >
                      {label(link.sender)}
                    </RouterLink>
                    {' → '}
                    <RouterLink
                      to="/device/$interfaceName/$address"
                      params={{ interfaceName: link.interfaceName, address: deviceAddressOf(link.receiver) }}
                      className="underline-offset-4 hover:underline"
                    >
                      {label(link.receiver)}
                    </RouterLink>
                    {link.name ? <span className="text-muted-foreground"> · {link.name}</span> : null}
                  </span>
                  <DialogButton type="button" aria-expanded={open === key} onClick={() => setOpen(open === key ? null : key)}>
                    {m.LINK_PARAMETERS()}
                  </DialogButton>
                  <DialogButton type="button" onClick={() => setRemoving(link)}>
                    {m.REMOVE()}
                  </DialogButton>
                </div>
                {open === key && (
                  <LinkParameters
                    interfaceName={link.interfaceName}
                    link={link}
                    receiverType={channelInfo.get(link.receiver)?.channel.type}
                    senderType={channelInfo.get(link.sender)?.channel.type}
                    senderDeviceType={channelInfo.get(link.sender)?.deviceType}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}

      <section aria-label={m.ADD_LINK()} className="flex flex-col gap-3">
        <h2 className="text-[17px] font-semibold">{m.ADD_LINK()}</h2>
        <label className="grid max-w-[460px] gap-1.5 text-sm text-muted-foreground">
          {m.DEVICE()}
          <NativeSelect value={device} onChange={(e) => setDevice(e.target.value)}>
            <option value="" />
            {linkableDevices.map((d) => (
              <option key={`${d.interfaceName}:${d.address}`} value={d.address}>
                {d.name ?? d.address} ({d.address})
              </option>
            ))}
          </NativeSelect>
        </label>
        {chosen && (
          <AddLinkForm key={chosen.address} interfaceName={chosen.interfaceName} deviceAddress={chosen.address} channels={chosen.channels ?? []} />
        )}
      </section>

      {removing && (
        <ConfirmDialog
          title={m.REMOVE_LINK()}
          confirmLabel={m.REMOVE()}
          busy={action.isPending}
          onCancel={() => setRemoving(null)}
          onConfirm={() =>
            action.mutate(
              { type: 'removeLink', interfaceName: removing.interfaceName, sender: removing.sender, receiver: removing.receiver },
              {
                onSuccess: () => showToast(m.LINK_REMOVED(), 'info'),
                onError: (error) => showToast(`${m.CHANGE_FAILED()}: ${error.message}`),
                onSettled: () => setRemoving(null),
              },
            )
          }
        >
          <p>{m.REMOVE_LINK_CONFIRM()}</p>
          <p>
            {label(removing.sender)} → {label(removing.receiver)}
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
};
