import type { ComponentPropsWithRef, ReactNode } from 'react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { m } from '../paraglide/messages';
import { cn } from '../lib/utils';

// A button in dialogs and settings: primary for the main action
export const DialogButton = ({ primary, ...props }: ComponentPropsWithRef<'button'> & { primary?: boolean }) => (
  <Button variant={primary ? 'default' : 'outline'} {...props} />
);

interface ConfirmDialogProps {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  // Instead of "Cancel", e.g. "Restart later"
  cancelLabel?: string;
  busy?: boolean;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  // E.g. a wider dialog for an editor
  className?: string;
}

// A modal question; Escape or a click outside cancels.
export const ConfirmDialog = ({
  title,
  children,
  confirmLabel,
  cancelLabel,
  busy,
  destructive,
  onConfirm,
  onCancel,
  className,
}: ConfirmDialogProps) => (
  <Dialog open onOpenChange={(open) => !open && onCancel()}>
    <DialogContent aria-label={title} className={cn('max-h-[calc(100vh-32px)] overflow-y-auto', className)}>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription className="sr-only">{title}</DialogDescription>
      </DialogHeader>
      <div className="text-sm">{children}</div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} autoFocus>
          {cancelLabel ?? m.CANCEL()}
        </Button>
        <Button type="button" variant={destructive ? 'destructive' : 'default'} disabled={busy} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
