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
  const next: Channel = { ...channel, name, ccuName: channel.name };
  shown.set(channel, next);
  return next;
};

type Entry = [string, Channel[]];
const shownEntries = new WeakMap<Entry, Entry>();

// A type whose channels are handed on as they were keeps its entry, so
// sections an event didn't touch stay the same objects (shareGroups in
// useChannels, sameItems in Dashboard)
export const withShownNames = (channelsByType: Entry[], drafts: NameDrafts): Entry[] =>
  channelsByType.map((entry) => {
    const [type, channels] = entry;
    const shown = channels.map((channel) => asShown(channel, drafts[channel.id]));
    if (shown.every((channel, i) => channel === channels[i])) return entry;
    const before = shownEntries.get(entry);
    if (before && before[1].length === shown.length && shown.every((channel, i) => channel === before[1][i])) {
      return before;
    }
    const next: Entry = [type, shown];
    shownEntries.set(entry, next);
    return next;
  });

// The names to store: the drafts that differ from what is stored
export const changedNames = (drafts: NameDrafts, byId: Map<number, Channel>) =>
  Object.entries(drafts)
    .map(([id, name]) => ({ id: Number(id), name: name.trim() }))
    .filter(({ id, name }) => byId.has(id) && name !== (byId.get(id)?.displayName ?? ''));
