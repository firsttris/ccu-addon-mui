import { useEffect, useState } from 'react';
import PencilIcon from '~icons/lucide/pencil';
import TrashIcon from '~icons/lucide/trash-2';
import CheckIcon from '~icons/lucide/check';
import XIcon from '~icons/lucide/x';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { m } from '../paraglide/messages';

interface EditableNameProps {
  name: string;
  onRename: (name: string) => void;
  onDelete?: () => void;
  children?: React.ReactNode;
}

// A name with buttons to rename it in place and to delete the object
export const EditableName = ({ name, onRename, onDelete, children }: EditableNameProps) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);
  const changed = draft.trim() !== '' && draft.trim() !== name;

  if (editing) {
    return (
      <form
        className="flex min-w-0 flex-1 items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (changed) onRename(draft.trim());
          setEditing(false);
        }}
      >
        <Input
          autoFocus
          aria-label={m.EDIT_NAME({ name })}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setDraft(name);
              setEditing(false);
            }
          }}
          className="h-9"
        />
        <Button type="submit" size="icon" variant="outline" aria-label={m.SAVE()} disabled={!changed}>
          <CheckIcon />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={m.CANCEL()}
          onClick={() => {
            setDraft(name);
            setEditing(false);
          }}
        >
          <XIcon />
        </Button>
      </form>
    );
  }
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
      {children}
      <Button type="button" size="icon" variant="ghost" aria-label={m.EDIT_NAME({ name })} onClick={() => setEditing(true)}>
        <PencilIcon />
      </Button>
      {onDelete && (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={m.DELETE_NAMED({ name })}
          className="text-muted-foreground hover:text-destructive"
          onClick={onDelete}
        >
          <TrashIcon />
        </Button>
      )}
    </div>
  );
};
