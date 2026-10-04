import { DeviceImage } from '../../components/DeviceImage';
import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from '@tanstack/react-table';
import SearchIcon from '~icons/lucide/search';
import ArrowUpIcon from '~icons/lucide/arrow-up';
import ArrowDownIcon from '~icons/lucide/arrow-down';
import TriangleAlertIcon from '~icons/lucide/triangle-alert';
import DownloadIcon from '~icons/lucide/circle-arrow-down';
import { useDeviceProblems, useDevices } from '../../queries';
import { usePageTitle } from '../../contexts/PageTitleContext';
import { useChannelNames } from './channelNames';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { m } from '../../paraglide/messages';
import { TableSkeletonRows } from '../../components/ui/skeleton';
import { cn } from '../../lib/utils';

interface DeviceRow {
  name: string;
  type: string;
  address: string;
  interfaceName: string;
  firmware: string;
  // Newer firmware the CCU has for the device
  availableFirmware: string;
  unreach: boolean;
  lowBat: boolean;
}

const column = createColumnHelper<DeviceRow>();

const StatusBadge = ({ row }: { row: DeviceRow }) =>
  row.unreach ? (
    <Badge variant="destructive">
      <span className="size-1.5 rounded-full bg-red-500" />
      {m.UNREACH()}
    </Badge>
  ) : row.lowBat ? (
    <Badge variant="warning">
      <span className="size-1.5 rounded-full bg-amber-500" />
      {m.LOW_BAT()}
    </Badge>
  ) : (
    <Badge variant="success">
      <span className="size-1.5 rounded-full bg-green-600" />
      {m.STATUS_OK()}
    </Badge>
  );

// The setup area's start: all devices of the CCU, searchable and sortable.
export const Setup = () => {
  usePageTitle(m.SETUP());
  const { data: devices = [], isPending: devicesLoading } = useDevices();
  const { data: problems = [] } = useDeviceProblems();
  const names = useChannelNames();
  const [filter, setFilter] = useState('');
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [onlyUpdates, setOnlyUpdates] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'name', desc: false }]);

  const rows = useMemo<DeviceRow[]>(() => {
    const problemOf = (address: string) => problems.find((p) => p.address.split(':')[0] === address);
    return devices.map((device) => ({
      name: names.get(device.address) ?? device.name ?? device.address,
      type: device.type,
      address: device.address,
      interfaceName: device.interfaceName,
      firmware: device.firmware ?? '',
      availableFirmware: device.availableFirmware ?? '',
      unreach: problemOf(device.address)?.unreach ?? false,
      lowBat: problemOf(device.address)?.lowBat ?? false,
    }));
  }, [devices, names, problems]);
  const problemCount = rows.filter((r) => r.unreach || r.lowBat).length;
  const updateCount = rows.filter((r) => r.availableFirmware).length;
  const shownRows = useMemo(
    () =>
      rows.filter((r) => (!onlyProblems || r.unreach || r.lowBat) && (!onlyUpdates || r.availableFirmware !== '')),
    [rows, onlyProblems, onlyUpdates],
  );

  const columns = useMemo(
    () => [
      column.accessor('name', {
        header: m.NAME(),
        cell: (info) => (
          <span className="flex items-center gap-3">
            <DeviceImage type={info.row.original.type} size={40} />
            <Link
              to="/device/$interfaceName/$address"
              params={{ interfaceName: info.row.original.interfaceName, address: info.row.original.address }}
              className="font-medium after:absolute after:inset-0 hover:underline"
            >
              {info.getValue()}
            </Link>
          </span>
        ),
      }),
      column.accessor('type', { header: m.DEVICE_TYPE() }),
      column.accessor('address', {
        header: m.ADDRESS(),
        cell: (info) => <span className="font-mono text-[13px] text-muted-foreground">{info.getValue()}</span>,
      }),
      column.accessor('interfaceName', { header: m.INTERFACE() }),
      column.accessor('firmware', {
        header: m.FIRMWARE(),
        cell: (info) => (
          <span className="inline-flex flex-wrap items-center gap-1.5 tabular-nums">
            {info.getValue()}
            {info.row.original.availableFirmware && (
              <Badge variant="info" title={m.UPDATE_AVAILABLE()}>
                <DownloadIcon className="size-3" />
                {info.row.original.availableFirmware}
              </Badge>
            )}
          </span>
        ),
      }),
      column.accessor((row) => (row.unreach ? 0 : row.lowBat ? 1 : 2), {
        id: 'status',
        header: m.STATUS(),
        cell: (info) => <StatusBadge row={info.row.original} />,
      }),
    ],
    [],
  );

  const table = useReactTable({
    data: shownRows,
    columns,
    state: { globalFilter: filter, sorting },
    onGlobalFilterChange: setFilter,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{m.DEVICES()}</h1>
        <p className="text-sm text-muted-foreground">{m.SETUP_DEVICES_HINT()}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label={m.SEARCH()}
            placeholder={m.SEARCH()}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            className="pl-9"
          />
        </div>
        {problemCount > 0 && (
          <Button
            variant="outline"
            aria-pressed={onlyProblems}
            onClick={() => setOnlyProblems(!onlyProblems)}
            className={cn('border-dashed', onlyProblems && 'border-solid bg-accent')}
          >
            <TriangleAlertIcon className="text-amber-600" />
            {m.ONLY_PROBLEMS()} ({problemCount})
          </Button>
        )}
        {updateCount > 0 && (
          <Button
            variant="outline"
            aria-pressed={onlyUpdates}
            onClick={() => setOnlyUpdates(!onlyUpdates)}
            className={cn('border-dashed', onlyUpdates && 'border-solid bg-accent')}
          >
            <DownloadIcon className="text-sky-600" />
            {m.ONLY_UPDATES()} ({updateCount})
          </Button>
        )}
      </div>
      <div className="overflow-hidden rounded-xl border bg-card">
        <Table aria-label={m.DEVICES()}>
          <TableHeader className="bg-muted/50">
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id} className="hover:bg-transparent">
                {group.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  return (
                    <TableHead
                      key={header.id}
                      aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'}
                    >
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className="inline-flex items-center gap-1 hover:text-foreground"
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {sorted === 'asc' && <ArrowUpIcon className="size-3.5" />}
                        {sorted === 'desc' && <ArrowDownIcon className="size-3.5" />}
                      </button>
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {devicesLoading && <TableSkeletonRows columns={table.getVisibleLeafColumns().length} rows={8} />}
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} className="relative">
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                ))}
              </TableRow>
            ))}
            {!devicesLoading && table.getRowModel().rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length} className="py-8 text-center text-muted-foreground">
                  {m.NO_RESULTS()}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <p className={cn('text-sm text-muted-foreground', devicesLoading && 'invisible')}>{m.DEVICE_COUNT({ count: table.getRowModel().rows.length })}</p>
    </>
  );
};
