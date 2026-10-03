import { useMemo } from 'react';
import { useChannels } from '../../queries';

// Names from ReGa by address. A device's name is that of its first channel
// with a name of its own (the CCU names channels "<type> <address>:<n>"
// until the user renames them).
export const useChannelNames = () => {
  const { data: channels } = useChannels({ all: true });
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
    return names;
  }, [channels]);
};
