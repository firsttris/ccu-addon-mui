import { describe, expect, it } from 'vitest';
import { parseDeviceListSearch, sortingOf, sortOf } from './deviceListSearch';

describe('parseDeviceListSearch', () => {
  it('keeps search, filters and sorting', () => {
    expect(parseDeviceListSearch({ q: 'Rollladen', problems: true, updates: 'true', sort: '-type' })).toEqual({
      q: 'Rollladen',
      problems: true,
      updates: true,
      sort: '-type',
    });
  });

  it('drops defaults, so /setup stays /setup', () => {
    expect(parseDeviceListSearch({ q: '', problems: false, updates: undefined, sort: 'name' })).toEqual({});
  });

  it('drops unknown columns and values', () => {
    expect(parseDeviceListSearch({ sort: '-password', problems: 'yes', tab: 'links' })).toEqual({});
  });

  it('takes a number typed into the URL as text', () => {
    expect(parseDeviceListSearch({ q: 123 })).toEqual({ q: '123' });
  });
});

describe('sorting', () => {
  it('is by name, ascending without a sort', () => {
    expect(sortingOf(undefined)).toEqual([{ id: 'name', desc: false }]);
  });

  it('round-trips through the URL', () => {
    for (const sorting of [[{ id: 'firmware', desc: true }], [{ id: 'status', desc: false }], []]) {
      expect(sortingOf(sortOf(sorting))).toEqual(sorting);
    }
  });

  it('leaves the default out and keeps unsorted as none', () => {
    expect(sortOf([{ id: 'name', desc: false }])).toBeUndefined();
    expect(sortOf([{ id: 'name', desc: true }])).toBe('-name');
    expect(sortOf([])).toBe('none');
  });
});
