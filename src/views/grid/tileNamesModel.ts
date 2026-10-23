import type { Channel } from '../../types/types';

// A channel's tile can show a name given in the app instead of the CCU's,
// which stays for the CCU's other interfaces (mui-tiles.json, displayName).
// The tiles take the channel's name, so the channel is handed to them with
// that name as its name.

// As long as the server takes it (tiles.MaxName), in characters
export const MaxTileName = 100;

// Names being given while arranging, by channel id; "" gives the channel
// the CCU's name back
export type NameDrafts = Record<number, string>;

// The name a tile shows: the one given in the app, while arranging the one
// being given, else the CCU's
export const shownName = (channel: Channel, draft?: string) => {
  const given = draft === undefined ? channel.displayName : draft.trim();
  return given || channel.name;
};

// The same channel object for the same name, so tiles whose channel did not
// change are not rendered again (sameItems in shareGroups and DeviceTile)
const shown = new WeakMap<Channel, Channel>();

export const asShown = (channel: Channel, draft?: string): Channel => {
  const name = shownName(channel, draft);
  if (name === channel.name) return channel;
  const before = shown.get(channel);
  if (before?.name === name) return before;
  const next: Channel = { ...channel, name };
  shown.set(channel, next);
  return next;
};

export const withShownNames = (channelsByType: [string, Channel[]][], drafts: NameDrafts): [string, Channel[]][] =>
  channelsByType.map(([type, channels]) => [type, channels.map((channel) => asShown(channel, drafts[channel.id]))]);

// The names to store: the drafts that differ from what is stored
export const changedNames = (drafts: NameDrafts, byId: Map<number, Channel>) =>
  Object.entries(drafts)
    .map(([id, name]) => ({ id: Number(id), name: name.trim() }))
    .filter(({ id, name }) => byId.has(id) && name !== (byId.get(id)?.displayName ?? ''));
