import { useState } from 'react';
import { Button } from '../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { m } from '../../paraglide/messages';
import { MaxTileName } from './tileNamesModel';

// Gives a channel's tile a name of its own, only in the app: the CCU's
// name stays for its other interfaces. Empty gives the CCU's back.
export const TileNameDialog = ({
  ccuName,
  name,
  onApply,
  onClose,
}: {
  // The channel's name on the CCU
  ccuName: string;
  // The name given so far, "" for none
  name: string;
  onApply: (name: string) => void;
  onClose: () => void;
}) => {
  const [draft, setDraft] = useState(name);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            onApply(draft.trim());
          }}
        >
          <DialogHeader>
            <DialogTitle>{m.TILE_NAME()}</DialogTitle>
            <DialogDescription>{m.TILE_NAME_HINT({ name: ccuName })}</DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            aria-label={m.TILE_NAME()}
            value={draft}
            placeholder={ccuName}
            maxLength={MaxTileName}
            onChange={(event) => setDraft(event.target.value)}
          />
          <DialogFooter className="gap-2 sm:justify-between">
            <Button type="button" variant="ghost" disabled={draft.trim() === ''} onClick={() => onApply('')}>
              {m.TILE_NAME_CCU()}
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                {m.CANCEL()}
              </Button>
              <Button type="submit">{m.APPLY()}</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
