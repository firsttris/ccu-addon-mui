import styled from '@emotion/styled';
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
import { useDevices } from '../../queries';
import { useWebSocketContext } from '../../hooks/useWebsocket';
import { useTranslations } from '../../i18n/utils';
import { useChannelNames } from './channelNames';
import { Pairing } from './Pairing';
import { DialogButton } from '../../components/ConfirmDialog';
import { ElevateDialog } from '../../components/ElevateDialog';

export const SetupContainer = styled.div`
  max-width: 1280px;
  margin: 0 auto;
  padding: 16px;
  padding-top: 76px;
  color: ${(props) => props.theme.colors.text};
`;

export const Notice = styled.p`
  padding: 10px 14px;
  border-radius: 6px;
  background: rgba(255, 193, 7, 0.2);
`;

const Search = styled.input`
  font: inherit;
  width: 100%;
  max-width: 320px;
  padding: 8px 10px;
  margin-bottom: 12px;
  box-sizing: border-box;
  border: 1px solid ${(props) => props.theme.colors.border};
  border-radius: 6px;
  color: ${(props) => props.theme.colors.text};
  background: ${(props) => props.theme.colors.background};
`;

const TableWrapper = styled.div`
  overflow-x: auto;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;

  th,
  td {
    text-align: left;
    padding: 8px 10px;
    border-bottom: 1px solid ${(props) => props.theme.colors.border};
    white-space: nowrap;
  }

  th button {
    font: inherit;
    font-weight: 600;
    padding: 0;
    border: none;
    background: none;
    color: inherit;
    cursor: pointer;
  }

  a {
    color: inherit;
    font-weight: 600;
  }
`;

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
  const t = useTranslations();
  const { userLevel, elevated } = useWebSocketContext();
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
        header: t('NAME'),
        cell: (info) => (
          <Link
            to="/device/$interfaceName/$address"
            params={{ interfaceName: info.row.original.interfaceName, address: info.row.original.address }}
          >
            {info.getValue()}
          </Link>
        ),
      }),
      column.accessor('type', { header: t('DEVICE_TYPE') }),
      column.accessor('address', { header: t('ADDRESS') }),
      column.accessor('interfaceName', { header: t('INTERFACE') }),
      column.accessor('firmware', { header: t('FIRMWARE') }),
    ],
    [t],
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
      <h1>{t('DEVICES')}</h1>
      {userLevel !== 'admin' && <Notice role="status">{t('ADMIN_ONLY')}</Notice>}
      {userLevel === 'admin' && !elevated && (
        <Notice role="status">
          {t('ELEVATE_HINT')}{' '}
          <DialogButton type="button" onClick={() => setElevating(true)}>
            {t('ELEVATE')}
          </DialogButton>
        </Notice>
      )}
      {elevating && <ElevateDialog onDone={() => setElevating(false)} onCancel={() => setElevating(false)} />}
      {userLevel === 'admin' && elevated && <Pairing />}
      <Search
        type="search"
        aria-label={t('SEARCH')}
        placeholder={t('SEARCH')}
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
      />
      <TableWrapper>
        <Table>
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
        </Table>
      </TableWrapper>
    </SetupContainer>
  );
};
