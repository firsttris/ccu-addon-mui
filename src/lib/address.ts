// A channel address is "<device>:<channel>", e.g. "0001D3C99C3C93:3"; a
// device address has no channel part

// The device part; a device address stays as it is
export const deviceAddressOf = (address: string) => address.split(':')[0];

// The channel part as text ("3"); undefined for a device address
export const channelOf = (address: string): string | undefined => address.split(':')[1];

// The channel number; 0 for a device address
export const channelNumberOf = (address: string) => Number(address.split(':')[1] ?? 0);
