// Pointing at one thing on a page through the URL's hash: the command
// palette opens "/room/1#tile-12", and the page scrolls to the tile of
// channel 12 and lights it up for a moment. Elements that can be pointed at
// carry their ids in data-focus (space separated, a device tile has one per
// channel).

export const tileFocusId = (channelId: number) => `tile-${channelId}`;
export const sysvarFocusId = (id: number) => `sysvar-${id}`;

// The data-focus value of a tile for all its channels
export const tileFocusAttr = (channelIds?: number[]) => channelIds?.map(tileFocusId).join(' ') || undefined;

// The id a hash points at ("#tile-12" -> "tile-12"); undefined for any other
// hash, so no page is made to look for something odd
export const focusIdFromHash = (hash: string) => {
  const id = hash.replace(/^#/, '');
  return /^[a-z]+-\d+$/.test(id) ? id : undefined;
};
