import { useMemo, useState } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { m } from '../../paraglide/messages';
import { useSetChannelNames } from '../../queries';
import type { Channel } from '../../types/types';
import type { GridTile } from './GridDashboard';
import { changedNames, type NameDrafts, withShownNames } from './tileNamesModel';

// Names given to tiles while arranging: shown at once, stored with Done
// (save), dropped with Cancel (discard)
export const useTileNames = (channelsByType: [string, Channel[]][]) => {
  const [drafts, setDrafts] = useState<NameDrafts>({});
  // The channel whose tile is being renamed (TileNameDialog)
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const setNames = useSetChannelNames();
  const { showToast } = useToast();
  const byId = useMemo(
    () => new Map(channelsByType.flatMap(([, channels]) => channels.map((channel) => [channel.id, channel] as const))),
    [channelsByType],
  );
  const shown = useMemo(() => withShownNames(channelsByType, drafts), [channelsByType, drafts]);
  const renaming = renamingId === null ? undefined : byId.get(renamingId);
  const changed = changedNames(drafts, byId);

  return {
    channelsByType: shown,
    // A tile that shows one channel
    rename: (tile: GridTile) => setRenamingId(tile.channelIds?.[0] ?? null),
    renaming: renaming && {
      ccuName: renaming.name,
      name: drafts[renaming.id] ?? renaming.displayName ?? '',
      apply: (name: string) => {
        setDrafts((before) => ({ ...before, [renaming.id]: name }));
        setRenamingId(null);
      },
      close: () => setRenamingId(null),
    },
    changed: changed.length > 0,
    busy: setNames.isPending,
    // Stores the names that changed, then goes on with after
    save: (after: () => void) => {
      if (changed.length === 0) {
        after();
        return;
      }
      setNames.mutate(changed, {
        onSuccess: after,
        onError: (error) => showToast(`${m.SAVE_FAILED()}: ${error.message}`),
      });
    },
    discard: () => {
      setDrafts({});
      setRenamingId(null);
    },
  };
};
