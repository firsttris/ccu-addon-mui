import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useDevices, useParamset } from '../../queries';
import type { DatapointValue, Link } from '../../types/types';
import {
  type LinkProfile,
  loadProfileTable,
  profilesFor,
  receiverKey,
  senderKey,
} from '../../controls/links/linkProfiles';
import { deviceAddressOf } from '../../lib/address';

const numberOf = (value: DatapointValue | undefined) => (typeof value === 'number' ? value : undefined);

// Channel and device type by channel address, to find the link profiles
export const useLinkChannelInfo = () => {
  const { data: devices = [] } = useDevices();
  return useMemo(
    () =>
      new Map(
        devices.flatMap((d) =>
          (d.channels ?? []).map((channel) => [channel.address, { channel, deviceType: d.type }] as const),
        ),
      ),
    [devices],
  );
};

// The WebUI profiles for a link, picked as the WebUI does: the receiver's
// table by its mode (receiverKey), the sender's entry by its operation mode
// or channel (senderKey). undefined while loading. The modes are read from
// MASTER only for the devices that need them.
export const useLinkProfiles = (interfaceName: string, link: Link, enabled = true): LinkProfile[] | undefined => {
  const channelInfo = useLinkChannelInfo();
  const receiver = channelInfo.get(link.receiver);
  const sender = channelInfo.get(link.sender);
  const light = receiver?.channel.type === 'UNIVERSAL_LIGHT_RECEIVER';
  const rgbw = useParamset(interfaceName, `${deviceAddressOf(link.receiver)}:0`, 'MASTER', {
    enabled: enabled && light && receiver?.deviceType === 'HmIP-RGBW',
  });
  const dali = useParamset(interfaceName, link.receiver, 'MASTER', {
    enabled: enabled && light && receiver?.deviceType === 'HmIP-DRG-DALI',
  });
  const senderMode = useParamset(interfaceName, link.sender, 'MASTER', {
    enabled:
      enabled &&
      (sender?.channel.type === 'MULTI_MODE_INPUT_TRANSMITTER' ||
        (sender?.channel.type === 'KEY_TRANSCEIVER' && sender.deviceType === 'HmIP-MOD-RC8')),
  });
  const receiverType =
    receiver &&
    receiverKey(receiver.channel.type, receiver.deviceType, {
      deviceOperationMode: numberOf(rgbw.data?.DEVICE_OPERATION_MODE),
      maxCapabilities: numberOf(dali.data?.UNIVERSAL_LIGHT_MAX_CAPABILITIES),
    });
  const { data: table } = useQuery({
    queryKey: ['linkProfiles', receiverType],
    // biome-ignore lint/style/noNonNullAssertion: enabled only with a receiverType
    queryFn: () => loadProfileTable(receiverType!),
    staleTime: Infinity,
    enabled: enabled && !!receiverType,
  });
  if (!table || !receiverType || !sender) return undefined;
  const key = senderKey(table, receiverType, sender.channel.type, {
    senderAddress: link.sender,
    operationMode: numberOf(senderMode.data?.CHANNEL_OPERATION_MODE),
    receiverDeviceType: receiver?.deviceType,
    senderDeviceType: sender.deviceType,
  });
  return profilesFor(table, receiverType, key, sender.deviceType);
};
