import type * as React from 'react';
import { cn } from '../../lib/utils';

// Date and time fields open their picker on a click anywhere in the field,
// not only on the browser's small icon
const PICKER_TYPES = new Set(['date', 'time', 'datetime-local', 'month', 'week']);

function Input({ className, type, onClick, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      onClick={(event) => {
        onClick?.(event);
        if (type && PICKER_TYPES.has(type) && !event.defaultPrevented) {
          try {
            event.currentTarget.showPicker?.();
          } catch {
            // Not allowed here (e.g. in a cross-origin frame): the icon still works
          }
        }
      }}
      data-slot="input"
      className={cn(
        'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
        'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
