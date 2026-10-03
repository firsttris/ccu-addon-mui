import { HTMLAttributes } from 'react';
import { TableCell, TableRow } from './table';
import { cn } from '../../lib/utils';
import { m } from '../../paraglide/messages';

// A grey placeholder that pulses while its content loads (as in
// gaiser-lager's table-skeleton.tsx), sized like what it stands for, so the
// page doesn't jump when the data arrives.
export const Skeleton = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div aria-hidden className={cn('rounded-md bg-foreground/10 motion-safe:animate-pulse', className)} {...props} />
);

// Widths that vary from row to row, so the rows don't look like stripes
const widths = ['w-3/4', 'w-1/2', 'w-2/3', 'w-5/12', 'w-7/12', 'w-1/3'];

// Placeholder rows inside a table body; the header stays as it is
export const TableSkeletonRows = ({ columns, rows = 5 }: { columns: number; rows?: number }) => (
  <>
    {Array.from({ length: rows }, (_, row) => (
      <TableRow key={row} aria-hidden className="hover:bg-transparent" data-skeleton>
        {Array.from({ length: columns }, (_, column) => (
          <TableCell key={column} className="py-3.5">
            <Skeleton className={cn('h-4', column === 0 ? widths[row % widths.length] : widths[(row + column + 2) % widths.length])} />
          </TableCell>
        ))}
      </TableRow>
    ))}
  </>
);

// Placeholder rows of a list (system variables, programs)
export const ListSkeletonItems = ({ rows = 5 }: { rows?: number }) => (
  <>
    {Array.from({ length: rows }, (_, row) => (
      <li key={row} aria-hidden className="flex items-center gap-4 px-4 py-3.5" data-skeleton>
        <Skeleton className={cn('h-4', widths[row % widths.length], 'max-w-64')} />
        <Skeleton className="ml-auto h-8 w-24 shrink-0 rounded-lg" />
      </li>
    ))}
  </>
);

// Placeholder lines of a setup card, under its heading
export const PanelSkeleton = ({ lines = 3, className }: { lines?: number; className?: string }) => (
  <div role="status" aria-label={m.LOADING()} className={cn('flex flex-col gap-3', className)}>
    {Array.from({ length: lines }, (_, line) => (
      <div key={line} className="flex items-center gap-6">
        <Skeleton className="h-4 w-28 shrink-0" />
        <Skeleton className={cn('h-4', widths[(line + 1) % widths.length])} />
      </div>
    ))}
  </div>
);

// Placeholder tiles of a dashboard section
export const TileSkeletonGrid = ({ tiles = 6 }: { tiles?: number }) => (
  <section role="status" aria-label={m.LOADING()} className="flex flex-col gap-3">
    <Skeleton className="h-6 w-40" />
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: tiles }, (_, tile) => (
        <div key={tile} aria-hidden className="flex h-40 flex-col justify-between rounded-2xl border bg-card p-3.5">
          <Skeleton className="size-9 rounded-xl" />
          <div className="flex flex-col gap-2">
            <Skeleton className={cn('h-4', widths[tile % widths.length])} />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  </section>
);
