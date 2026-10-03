import { HTMLAttributes, ReactNode, useMemo, useState } from 'react';
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
import { useDevices } from '../../queries';
import { useWebSocketContext } from '../../hooks/useWebsocket';
import { useChannelNames } from './channelNames';
import { Pairing } from './Pairing';
import { SystemInfo } from './SystemInfo';
import { Sessions } from './Sessions';
import { DialogButton } from '../../components/ConfirmDialog';
import { ElevateDialog } from '../../components/ElevateDialog';
import { m } from '../../paraglide/messages';

export const SetupContainer = ({ children }: { children: ReactNode }) => (
  <div className="max-w-[1280px] mx-auto p-4 pt-[76px] text-text">{children}</div>
);

export const Notice = (props: HTMLAttributes<HTMLParagraphElement>) => (
  <p className="py-[10px] px-[14px] rounded-md bg-[rgba(255,193,7,0.2)]" {...props} />
);

interface DeviceRow {
  name: string;
  type: string;
  address: string;
  interfaceName: string;
  firmware: string;
}

const column = createColumnHelper<DeviceRow>();

// The setup area's start: all devices of the CCU, searchable and sortable.
export const Setup = () => {
  const { userLevel, elevated, authRequired } = useWebSocketContext();
  const [elevating, setElevating] = useState(false);
  const { data: devices = [] } = useDevices();
  const names = useChannelNames();
  const [filter, setFilter] = useState('');
  const [sorting, setSorting] = useState<SortingState>([{ id: 'name', desc: false }]);

  const rows = useMemo<DeviceRow[]>(
    () =>
      devices.map((device) => ({
        name: names.get(device.address) ?? device.name ?? device.address,
        type: device.type,
        address: device.address,
        interfaceName: device.interfaceName,
        firmware: device.firmware ?? '',
      })),
    [devices, names],
  );

  const columns = useMemo(
    () => [
      column.accessor('name', {
        header: m.NAME(),
        cell: (info) => (
          <Link
            to="/device/$interfaceName/$address"
            params={{ interfaceName: info.row.original.interfaceName, address: info.row.original.address }}
          >
            {info.getValue()}
          </Link>
        ),
      }),
      column.accessor('type', { header: m.DEVICE_TYPE() }),
      column.accessor('address', { header: m.ADDRESS() }),
      column.accessor('interfaceName', { header: m.INTERFACE() }),
      column.accessor('firmware', { header: m.FIRMWARE() }),
    ],
    [],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { globalFilter: filter, sorting },
    onGlobalFilterChange: setFilter,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <SetupContainer>
      <h1>{m.DEVICES()}</h1>
      {userLevel !== 'admin' && <Notice role="status">{m.ADMIN_ONLY()}</Notice>}
      {userLevel === 'admin' && !elevated && (
        <Notice role="status">
          {m.ELEVATE_HINT()}{' '}
          <DialogButton type="button" onClick={() => setElevating(true)}>
            {m.ELEVATE()}
          </DialogButton>
        </Notice>
      )}
      {elevating && <ElevateDialog onDone={() => setElevating(false)} onCancel={() => setElevating(false)} />}
      {userLevel === 'admin' && <SystemInfo />}
      {userLevel === 'admin' && elevated && <Pairing />}
      {userLevel === 'admin' && elevated && authRequired && <Sessions />}
      <input
        className="[font:inherit] w-full max-w-[320px] py-2 px-[10px] mb-3 box-border border border-solid border-border rounded-md text-text bg-background"
        type="search"
        aria-label={m.SEARCH()}
        placeholder={m.SEARCH()}
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
      />
      <div className="overflow-x-auto">
        <table
          aria-label={m.DEVICES()}
          className="w-full border-collapse text-[14px] [&_:is(th,td)]:text-left [&_:is(th,td)]:py-2 [&_:is(th,td)]:px-[10px] [&_:is(th,td)]:border-b [&_:is(th,td)]:border-border [&_:is(th,td)]:whitespace-nowrap [&_th_button]:[font:inherit] [&_th_button]:font-semibold [&_th_button]:p-0 [&_th_button]:border-none [&_th_button]:bg-transparent [&_th_button]:text-inherit [&_th_button]:cursor-pointer [&_a]:text-inherit [&_a]:font-semibold"
        >
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => (
                  <th
                    key={header.id}
                    aria-sort={
                      header.column.getIsSorted() === 'asc'
                        ? 'ascending'
                        : header.column.getIsSorted() === 'desc'
                          ? 'descending'
                          : 'none'
                    }
                  >
                    <button type="button" onClick={header.column.getToggleSortingHandler()}>
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {{ asc: ' ▲', desc: ' ▼' }[header.column.getIsSorted() as string] ?? ''}
                    </button>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SetupContainer>
  );
};
