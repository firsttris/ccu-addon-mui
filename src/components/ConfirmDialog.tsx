import { ComponentPropsWithRef, ReactNode, useEffect, useRef } from 'react';
import { m } from '../paraglide/messages';

export const DialogButton = ({
  primary,
  className = '',
  ...props
}: ComponentPropsWithRef<'button'> & { primary?: boolean }) => (
  <button
    className={`[font:inherit] py-2 px-[14px] rounded-md cursor-pointer border border-solid border-border disabled:opacity-50 disabled:cursor-default ${
      primary ? 'text-white bg-[#1976d2]' : 'text-foreground bg-background'
    } ${className}`}
    {...props}
  />
);

interface ConfirmDialogProps {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// A modal question; Escape or a click outside cancels.
export const ConfirmDialog = ({ title, children, confirmLabel, busy, onConfirm, onCancel }: ConfirmDialogProps) => {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-[1500] flex items-center justify-center p-4 bg-[rgba(0,0,0,0.5)]" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className="w-[min(480px,100%)] max-h-[calc(100vh_-_32px)] overflow-y-auto box-border p-5 rounded-lg text-foreground bg-card shadow-[0_8px_24px_rgba(0,0,0,0.3)]"
      >
        <h2 className="mt-0 mx-0 mb-3 text-[18px]">{title}</h2>
        {children}
        <div className="flex justify-end gap-2 mt-4">
          <DialogButton ref={cancelRef} type="button" onClick={onCancel}>
            {m.CANCEL()}
          </DialogButton>
          <DialogButton type="button" primary disabled={busy} onClick={onConfirm}>
            {confirmLabel}
          </DialogButton>
        </div>
      </div>
    </div>
  );
};
