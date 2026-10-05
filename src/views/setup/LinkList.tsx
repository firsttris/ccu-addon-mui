import { useEffect, useMemo, useRef, useState } from 'react';
import { Link as RouterLink } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import ArrowRightIcon from '~icons/lucide/arrow-right';
import { useChannelList, useDevices, useLinkAction, useLinkParamset, useRooms } from '../../queries';
import { useToast } from '../../contexts/ToastContext';
import { InterfaceLink } from '../../types/protocol';
import { ConfirmDialog, DialogButton } from '../../components/ConfirmDialog';
import { DeviceImage } from '../../components/DeviceImage';
import { ListSkeletonItems } from '../../components/ui/skeleton';
import { detectProfile, loadProfileTable, profilesFor, senderKey } from '../../controls/links/linkProfiles';
import { getLocale } from '../../paraglide/runtime';
import { useChannelNames } from './channelNames';
import { LinkParameters, useLinkChannelInfo, useOperationMode } from './Links';
import { m } from '../../paraglide/messages';

const deviceAddressOf = (address: string) => address.split(':')[0];

// Identifies a link in the list
export const linkKey = (link: Pick<InterfaceLink, 'interfaceName' | 'sender' | 'receiver'>) =>
  `${link.interfaceName}:${link.sender}>${link.receiver}`;

// Rendered once the element comes near the screen: the behaviour of each
// link needs two requests to the CCU, so only the visible ones ask
const useNearScreen = <T extends Element>() => {
  const ref = useRef<T>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    if (near || !ref.current) return;
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [near]);
  return [ref, near] as const;
};

// What the link does, in words: the WebUI profile its values fit
// (get_cur_profile2 in ic_common.tcl), or "own settings"
const useBehaviour = (link: InterfaceLink, enabled: boolean) => {
  const channelInfo = useLinkChannelInfo();
  const { description, values } = useLinkParamset(link.interfaceName, link.receiver, link.sender, enabled);
  const receiverType = channelInfo.get(link.receiver)?.channel.type;
  const sender = channelInfo.get(link.sender);
  const operationMode = useOperationMode(link.interfaceName, link.sender, sender?.channel.type, enabled);
  const { data: table } = useQuery({
    queryKey: ['linkProfiles', receiverType],
    queryFn: () => loadProfileTable(receiverType!),
    staleTime: Infinity,
    enabled: enabled && !!receiverType,
  });
  if (!table || !values.data || !description.data || !receiverType || !sender) return undefined;
  const key = senderKey(table, receiverType, sender.channel.type, {
    senderAddress: link.sender,
    operationMode,
    receiverDeviceType: channelInfo.get(link.receiver)?.deviceType,
  });
  const profiles = profilesFor(table, receiverType, key, sender.deviceType);
  if (profiles.length === 0) return undefined;
  const id = detectProfile(profiles, values.data);
  const profile = profiles.find((p) => p.id === id);
  const lang = getLocale();
  return profile ? profile.name[lang] || profile.name.de : m.LINK_PROFILE_EXPERT();
};

interface Endpoint {
  address: string;
  name: string;
  deviceType?: string;
  rooms: string[];
}

// One end of a link: the device picture with the channel marked, its name
// and where it is
const EndpointView = ({ endpoint, interfaceName }: { endpoint: Endpoint; interfaceName: string }) => (
  <div className="flex min-w-0 flex-1 items-center gap-3">
    <DeviceImage
      type={endpoint.deviceType}
      size={48}
      channel={endpoint.address.split(':')[1]}
      className="shrink-0 rounded-lg"
    />
    <div className="flex min-w-0 flex-col">
      <RouterLink
        to="/device/$interfaceName/$address"
        params={{ interfaceName, address: deviceAddressOf(endpoint.address) }}
        className="truncate text-sm font-medium underline-offset-4 hover:underline"
      >
        {endpoint.name}
      </RouterLink>
      <span className="truncate text-xs text-muted-foreground">
        {[...endpoint.rooms, endpoint.address].join(' · ')}
      </span>
    </div>
  </div>
);

const LinkRow = ({
  link,
  endpoint,
  open,
  focus,
  onToggle,
  onRemove,
}: {
  link: InterfaceLink;
  endpoint: (address: string) => Endpoint;
  open: boolean;
  // Just added: scrolled to, with its behaviour open
  focus: boolean;
  onToggle: () => void;
  onRemove: () => void;
}) => {
  const [ref, near] = useNearScreen<HTMLLIElement>();
  useEffect(() => {
    if (focus) ref.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  }, [focus, ref]);
  const behaviour = useBehaviour(link, near);
  const channelInfo = useLinkChannelInfo();
  const sender = endpoint(link.sender);
  const receiver = endpoint(link.receiver);
  return (
    <li ref={ref} className="flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-[1_1_480px] items-center gap-3 max-sm:flex-col max-sm:items-stretch">
          <EndpointView endpoint={sender} interfaceName={link.interfaceName} />
          <ArrowRightIcon
            aria-label={m.LINK_CONTROLS()}
            className="size-5 shrink-0 text-primary max-sm:rotate-90 max-sm:self-center"
          />
          <EndpointView endpoint={receiver} interfaceName={link.interfaceName} />
        </div>
        <div className="flex gap-2">
          <DialogButton type="button" aria-expanded={open} onClick={onToggle}>
            {m.LINK_SET_BEHAVIOUR()}
          </DialogButton>
          <DialogButton type="button" onClick={onRemove}>
            {m.REMOVE()}
          </DialogButton>
        </div>
      </div>
      {(behaviour || link.name) && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {behaviour && (
            <span className="rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary">
              {m.LINK_BEHAVIOUR()}: {behaviour}
            </span>
          )}
          {link.name && <span className="text-muted-foreground">„{link.name}“</span>}
        </div>
      )}
      {open && (
        <LinkParameters
          interfaceName={link.interfaceName}
          link={link}
          receiverType={channelInfo.get(link.receiver)?.channel.type}
          senderType={channelInfo.get(link.sender)?.channel.type}
          senderDeviceType={channelInfo.get(link.sender)?.deviceType}
          receiverDeviceType={channelInfo.get(link.receiver)?.deviceType}
        />
      )}
    </li>
  );
};

interface LinkListProps {
  links: InterfaceLink[];
  isLoading: boolean;
  // On a device page: its links split into what it controls and what
  // controls it; otherwise grouped by the sending device
  device?: string;
  // The link just added (linkKey): opened and scrolled to once it shows
  added?: string;
}

// Direct links as "who controls whom": sender → receiver with pictures,
// rooms and what the link does
export const LinkList = ({ links, isLoading, device, added }: LinkListProps) => {
  const { data: devices = [] } = useDevices();
  const { data: channels = [] } = useChannelList();
  const { data: rooms = [] } = useRooms();
  const names = useChannelNames();
  const action = useLinkAction();
  const { showToast } = useToast();
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    if (added) setOpen(added);
  }, [added]);
  const [removing, setRemoving] = useState<InterfaceLink | null>(null);

  const endpoint = useMemo(() => {
    const roomNames = new Map(rooms.map((r) => [r.id, r.name]));
    const channelRooms = new Map(channels.map((c) => [c.address, c.rooms ?? []]));
    const deviceTypes = new Map(devices.map((d) => [d.address, d.type]));
    return (address: string): Endpoint => ({
      address,
      name: names.get(address) ?? address,
      deviceType: deviceTypes.get(deviceAddressOf(address)),
      rooms: (channelRooms.get(address) ?? []).flatMap((id) => roomNames.get(id) ?? []),
    });
  }, [devices, channels, rooms, names]);

  const groups = useMemo(() => {
    if (device) {
      return [
        {
          key: 'controls',
          title: m.LINKS_CONTROLS(),
          links: links.filter((l) => deviceAddressOf(l.sender) === device),
        },
        {
          key: 'controlled',
          title: m.LINKS_CONTROLLED_BY(),
          links: links.filter((l) => deviceAddressOf(l.sender) !== device),
        },
      ].filter((g) => g.links.length > 0);
    }
    const bySender = new Map<string, InterfaceLink[]>();
    for (const link of links) {
      const key = deviceAddressOf(link.sender);
      bySender.set(key, [...(bySender.get(key) ?? []), link]);
    }
    return [...bySender.entries()]
      .map(([address, list]) => ({
        key: address,
        title: names.get(address) ?? address,
        address,
        links: list.sort((a, b) => a.sender.localeCompare(b.sender, undefined, { numeric: true })),
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [links, device, names]);

  const deviceTypes = useMemo(() => new Map(devices.map((d) => [d.address, d.type])), [devices]);

  return (
    <>
      {isLoading && (
        <ul aria-label={m.LINKS()} className="flex flex-col divide-y rounded-2xl border bg-card">
          <ListSkeletonItems rows={3} />
        </ul>
      )}
      {groups.map((group) => (
        <section key={group.key} aria-label={group.title} className="flex flex-col gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            {'address' in group && (
              <DeviceImage type={deviceTypes.get(group.address as string)} size={28} className="rounded-md" />
            )}
            {group.title}
            <span className="text-xs font-normal text-muted-foreground">{group.links.length}</span>
          </h3>
          <ul aria-label={`${m.LINKS()}: ${group.title}`} className="flex flex-col divide-y rounded-2xl border bg-card">
            {group.links.map((link) => {
              const key = linkKey(link);
              return (
                <LinkRow
                  key={key}
                  link={link}
                  endpoint={endpoint}
                  open={open === key}
                  focus={added === key}
                  onToggle={() => setOpen(open === key ? null : key)}
                  onRemove={() => setRemoving(link)}
                />
              );
            })}
          </ul>
        </section>
      ))}

      {removing && (
        <ConfirmDialog
          title={m.REMOVE_LINK()}
          confirmLabel={m.REMOVE()}
          busy={action.isPending}
          onCancel={() => setRemoving(null)}
          onConfirm={() =>
            action.mutate(
              {
                type: 'removeLink',
                interfaceName: removing.interfaceName,
                sender: removing.sender,
                receiver: removing.receiver,
              },
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
            {endpoint(removing.sender).name} → {endpoint(removing.receiver).name}
          </p>
        </ConfirmDialog>
      )}
    </>
  );
};
