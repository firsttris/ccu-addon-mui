import type * as React from 'react';
import { cn } from '../../lib/utils';

// A styled native <select>: on a tablet the system picker is easier to use
// than a custom popover, and it needs no extra code.
function NativeSelect({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        'border-input dark:bg-input/30 h-9 w-full min-w-0 appearance-none rounded-md border bg-transparent py-1 pr-8 pl-3 text-sm shadow-xs transition-[color,box-shadow] outline-none disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
        className,
      )}
      {...props}
    />
  );
}

// For a select inline in a row of fields (program and rule editors)
const inlineSelectClass = 'h-9 min-w-0 max-w-full md:text-[13px]';

export { inlineSelectClass, NativeSelect };
