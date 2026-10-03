import { HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

// A card in the setup area, with a small heading
export const Panel = ({ className, ...props }: HTMLAttributes<HTMLElement>) => (
  <section
    className={cn(
      'flex flex-col gap-3 rounded-xl border bg-card p-5 text-card-foreground shadow-xs [&_h2]:text-base [&_h2]:font-semibold [&_p]:text-sm [&_p]:text-muted-foreground',
      className,
    )}
    {...props}
  />
);
