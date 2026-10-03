import { useMemo } from 'react';
import { useChannels, useDevices } from '../../queries';

// Names from ReGa by address. A device's name is that of its first channel
// with a name of its own (the CCU names channels "<type> <address>:<n>"
// until the user renames them).
export const useChannelNames = () => {
  const { data: channels } = useChannels({ all: true });
  const { data: devices } = useDevices();
  return useMemo(() => {
    const names = new Map<string, string>();
    for (const channel of channels ?? []) {
      names.set(channel.address, channel.name);
      const device = channel.address.split(':')[0];
      const existing = names.get(device);
      const generic = channel.name.includes(channel.address);
      if (!existing || (existing.includes(device) && !generic)) {
        names.set(device, generic ? channel.name.replace(/:\d+$/, '') : channel.name);
      }
    }
    // The device's own name from ReGa wins, unless it is still the
    // default ("<type> <address>") and a channel has a real name
    for (const device of devices ?? []) {
      const generic = device.name?.includes(device.address);
      if (device.name && (!generic || !names.has(device.address))) {
        names.set(device.address, device.name);
      }
    }
    return names;
  }, [channels, devices]);
};
