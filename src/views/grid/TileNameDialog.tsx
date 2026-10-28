import { useId, useState } from 'react';
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
import { MaxTileName, type NameDrafts, type NameField } from './tileNamesModel';

// Gives the channels of a tile names of their own, only in the app: the
// CCU's names stay for its other interfaces. Empty gives the CCU's back.
// One field for a channel's tile, one per channel for a device's (e.g.
// each key of its buttons).
export const TileNameDialog = ({
  fields,
  onApply,
  onClose,
}: {
  fields: NameField[];
  onApply: (names: NameDrafts) => void;
  onClose: () => void;
}) => {
  const [drafts, setDrafts] = useState<NameDrafts>(() => Object.fromEntries(fields.map((f) => [f.id, f.name])));
  const id = useId();
  const single = fields.length === 1;
  const given = fields.some((f) => drafts[f.id].trim() !== '');
  const all = (name: (field: NameField) => string): NameDrafts =>
    Object.fromEntries(fields.map((f) => [f.id, name(f)]));
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            onApply(all((f) => drafts[f.id].trim()));
          }}
        >
          <DialogHeader>
            <DialogTitle>{single ? m.TILE_NAME() : m.TILE_NAMES()}</DialogTitle>
            <DialogDescription>
              {single ? m.TILE_NAME_HINT({ name: fields[0].ccuName }) : m.TILE_NAMES_HINT()}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            {fields.map((field, index) => (
              <div key={field.id} className="flex flex-col gap-1.5">
                {!single && (
                  <label htmlFor={`${id}-${field.id}`} className="truncate text-xs text-muted-foreground">
                    {field.ccuName}
                  </label>
                )}
                <Input
                  id={`${id}-${field.id}`}
                  autoFocus={index === 0}
                  aria-label={single ? m.TILE_NAME() : undefined}
                  value={drafts[field.id]}
                  placeholder={field.ccuName}
                  maxLength={MaxTileName}
                  onChange={(event) => setDrafts((before) => ({ ...before, [field.id]: event.target.value }))}
                />
              </div>
            ))}
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button type="button" variant="ghost" disabled={!given} onClick={() => onApply(all(() => ''))}>
              {single ? m.TILE_NAME_CCU() : m.TILE_NAMES_CCU()}
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
