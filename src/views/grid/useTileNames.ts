import { useMemo, useState } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { m } from '../../paraglide/messages';
import { useSetChannelNames } from '../../queries';
import type { Channel } from '../../types/types';
import type { GridTile } from './GridDashboard';
import { changedNames, type NameDrafts, nameFields, withShownNames } from './tileNamesModel';

// Names given to tiles while arranging: shown at once, stored with Done
// (save), dropped with Cancel (discard)
export const useTileNames = (channelsByType: [string, Channel[]][]) => {
  const [drafts, setDrafts] = useState<NameDrafts>({});
  // The channels of the tile being renamed (TileNameDialog)
  const [renamingIds, setRenamingIds] = useState<number[]>([]);
  const setNames = useSetChannelNames();
  const { showToast } = useToast();
  const byId = useMemo(
    () => new Map(channelsByType.flatMap(([, channels]) => channels.map((channel) => [channel.id, channel] as const))),
    [channelsByType],
  );
  const shown = useMemo(() => withShownNames(channelsByType, drafts), [channelsByType, drafts]);
  const fields = nameFields(renamingIds, byId, drafts);
  const changed = changedNames(drafts, byId);

  return {
    channelsByType: shown,
    // A channel's tile or one of a device's channels, e.g. its keys
    rename: (tile: GridTile) => setRenamingIds(tile.channelIds ?? []),
    renaming: fields.length > 0 && {
      fields,
      apply: (names: NameDrafts) => {
        setDrafts((before) => ({ ...before, ...names }));
        setRenamingIds([]);
      },
      close: () => setRenamingIds([]),
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
      setRenamingIds([]);
    },
  };
};
