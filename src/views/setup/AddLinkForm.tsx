import { useMemo, useState } from 'react';
import { useChannelList, useDevices, useLinkAction } from '../../queries';
import { useToast } from '../../contexts/ToastContext';
import type { Channel, DeviceChannel } from '../../types/types';
import { ChannelField } from '../../components/ChannelField';
import { DialogButton } from '../../components/ConfirmDialog';
import { useChannelNames } from './channelNames';
import { m } from '../../paraglide/messages';
import { linkKey } from './LinkList';
import { Input } from '../../components/ui/input';
import { errorText } from '../../lib/errors';
import { deviceAddressOf } from '../../lib/address';

import type { LinksProps } from './Links';

const shareRole = (a: string[] = [], b: string[] = []) => a.some((role) => b.includes(role));

// Linking a channel of a device with a fitting channel of another one
// Without a device (the overview): any linkable channel of any device, the
// device and interface follow from it
export const AddLinkForm = ({
  interfaceName: deviceInterface,
  deviceAddress: device,
  channels,
  onAdded,
}: Partial<LinksProps> & { onAdded?: (key: string) => void }) => {
  const { showToast } = useToast();
  const { data: devices = [] } = useDevices();
  const names = useChannelNames();
  const action = useLinkAction();
  const anyDevice = device === undefined;
  const linkable = useMemo(
    () =>
      (anyDevice ? devices.flatMap((d) => d.channels ?? []) : (channels ?? [])).filter(
        (c) => c.linkSourceRoles?.length || c.linkTargetRoles?.length,
      ),
    [anyDevice, devices, channels],
  );
  const [own, setOwn] = useState('');
  const deviceAddress = device ?? deviceAddressOf(own);
  const interfaceName = deviceInterface ?? devices.find((d) => d.address === deviceAddress)?.interfaceName ?? '';
  const [partner, setPartner] = useState('');
  const [linkName, setLinkName] = useState('');
  const ownChannel = linkable.find((c) => c.address === own);

  // The channels as the channel dialog shows them (names, rooms from ReGa)
  const { data: regaChannels = [] } = useChannelList();
  const asChannels = useMemo(() => {
    const byAddress = new Map(regaChannels.map((c) => [c.address, c]));
    return (list: DeviceChannel[]) =>
      list.map(
        (c, i) =>
          byAddress.get(c.address) ??
          ({
            id: -(i + 1),
            address: c.address,
            name: names.get(c.address) ?? c.address,
            type: c.type,
            interfaceName,
            datapoints: {},
          } as unknown as Channel),
      );
  }, [regaChannels, names, interfaceName]);

  // Channels of other devices on the same interface that fit the chosen one
  const partners = useMemo(() => {
    if (!ownChannel) return [];
    return devices
      .filter((d) => d.interfaceName === interfaceName && d.address !== deviceAddress)
      .flatMap((d) => d.channels ?? [])
      .filter(
        (c) =>
          shareRole(ownChannel.linkSourceRoles, c.linkTargetRoles) ||
          shareRole(ownChannel.linkTargetRoles, c.linkSourceRoles),
      );
  }, [devices, interfaceName, deviceAddress, ownChannel]);

  const ownChannels = useMemo(() => asChannels(linkable), [asChannels, linkable]);
  const partnerChannels = useMemo(() => asChannels(partners), [asChannels, partners]);

  const add = () => {
    const partnerChannel = partners.find((c) => c.address === partner);
    if (!ownChannel || !partnerChannel) return;
    // The side with matching source roles sends
    const ownSends = shareRole(ownChannel.linkSourceRoles, partnerChannel.linkTargetRoles);
    const sender = ownSends ? own : partner;
    const receiver = ownSends ? partner : own;
    action.mutate(
      { type: 'addLink', interfaceName, sender, receiver, name: linkName },
      {
        onSuccess: () => {
          showToast(m.LINK_ADDED(), 'info');
          // Its behaviour next, so it doesn't stay on the defaults unnoticed
          onAdded?.(linkKey({ interfaceName, sender, receiver }));
          setPartner('');
          setLinkName('');
        },
        onError: (error) => showToast(errorText(error, m.CHANGE_FAILED)),
      },
    );
  };

  return (
    <>
      {linkable.length > 0 && (
        <form
          className="mt-2 grid max-w-[460px] gap-3 [&_label]:grid [&_label]:gap-1.5 [&_label]:text-sm [&_label]:text-muted-foreground"
          aria-label={m.ADD_LINK()}
          onSubmit={(event) => {
            event.preventDefault();
            add();
          }}
        >
          <strong className="text-sm">{m.ADD_LINK()}</strong>
          <div className="grid gap-1.5 text-sm text-muted-foreground">
            {anyDevice ? m.LINK_CHANNEL() : m.LINK_OWN_CHANNEL()}
            <ChannelField
              label={anyDevice ? m.LINK_CHANNEL() : m.LINK_OWN_CHANNEL()}
              channels={ownChannels}
              value={ownChannels.find((c) => c.address === own)?.id}
              includeHidden
              onChange={(id) => {
                setOwn(ownChannels.find((c) => c.id === id)?.address ?? '');
                setPartner('');
              }}
            />
          </div>
          <div className="grid gap-1.5 text-sm text-muted-foreground">
            {m.LINK_PARTNER()}
            <ChannelField
              label={m.LINK_PARTNER()}
              channels={partnerChannels}
              value={partnerChannels.find((c) => c.address === partner)?.id}
              disabled={!ownChannel}
              includeHidden
              onChange={(id) => setPartner(partnerChannels.find((c) => c.id === id)?.address ?? '')}
            />
          </div>
          <label>
            {m.LINK_NAME()}
            <Input value={linkName} onChange={(e) => setLinkName(e.target.value)} />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <DialogButton type="submit" primary disabled={!own || !partner || action.isPending}>
              {m.LINK()}
            </DialogButton>
          </div>
        </form>
      )}
    </>
  );
};
