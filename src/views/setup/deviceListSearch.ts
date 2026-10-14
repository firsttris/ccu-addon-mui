import type { SortingState } from '@tanstack/react-table';

// The device list's search, filters and sorting as URL search params, so
// they survive opening a device and coming back (and can be shared).
// Defaults are left out of the URL: /setup stays /setup.
export interface DeviceListSearch {
  q?: string;
  problems?: boolean;
  updates?: boolean;
  // Column id, '-' in front for descending, 'none' unsorted; absent is by
  // name, ascending
  sort?: string;
}

export const DEVICE_LIST_COLUMNS = ['name', 'type', 'address', 'interfaceName', 'firmware', 'status'] as const;

const DEFAULT_SORT = 'name';
const UNSORTED = 'none';

const isFlag = (value: unknown) => value === true || value === 'true';

const isSort = (value: unknown): value is string =>
  typeof value === 'string' &&
  (value === UNSORTED || (DEVICE_LIST_COLUMNS as readonly string[]).includes(value.replace(/^-/, '')));

// The route's validateSearch: unknown or default values are dropped
export const parseDeviceListSearch = (search: Record<string, unknown>): DeviceListSearch => ({
  // A hand-typed ?q=123 arrives as a number (the router parses values as JSON)
  ...((typeof search.q === 'string' || typeof search.q === 'number') && search.q !== '' && { q: String(search.q) }),
  ...(isFlag(search.problems) && { problems: true }),
  ...(isFlag(search.updates) && { updates: true }),
  ...(isSort(search.sort) && search.sort !== DEFAULT_SORT && { sort: search.sort }),
});

export const sortingOf = (sort: string | undefined): SortingState => {
  const value = sort ?? DEFAULT_SORT;
  if (value === UNSORTED) return [];
  return [{ id: value.replace(/^-/, ''), desc: value.startsWith('-') }];
};

// A third click on a header clears the sorting: 'none'
export const sortOf = (sorting: SortingState): string | undefined => {
  const [first] = sorting;
  if (!first) return UNSORTED;
  const sort = `${first.desc ? '-' : ''}${first.id}`;
  return sort === DEFAULT_SORT ? undefined : sort;
};

// The last search of the list, for the device page's link back to it: the
// device's URL doesn't carry it
let lastSearch: DeviceListSearch = {};
export const rememberDeviceListSearch = (search: DeviceListSearch) => {
  lastSearch = search;
};
export const lastDeviceListSearch = () => lastSearch;
