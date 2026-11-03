import { describe, expect, it } from 'vitest';
import { filterEntries, isPaletteShortcut, moveActive, type PaletteEntry } from './commandPaletteModel';

const entry = (
  id: string,
  group: PaletteEntry['group'],
  label: string,
  extra: Partial<PaletteEntry> = {},
): PaletteEntry => ({
  id,
  group,
  label,
  icon: 'list',
  target: { kind: 'route', to: '/' },
  ...extra,
});

const entries = [
  entry('a1', 'actions', 'Dark mode'),
  entry('c1', 'channels', 'Wohnzimmer Licht', { detail: 'Wohnzimmer', keywords: ['HmIP-BSM', '000855699C4F38:4'] }),
  entry('c2', 'channels', 'Küche Licht', { detail: 'Küche' }),
  entry('p1', 'pages', 'Programme'),
  entry('r1', 'rooms', 'Wohnzimmer'),
  entry('r2', 'rooms', 'Küche'),
];

describe('filterEntries', () => {
  it('lists the groups in a fixed order', () => {
    expect(filterEntries(entries, 'licht').map((e) => e.id)).toEqual(['c1', 'c2']);
    expect(filterEntries(entries, 'wohn').map((e) => e.id)).toEqual(['r1', 'c1']);
  });

  it('shows no channels without a query, only a start of the others', () => {
    expect(filterEntries(entries, '').map((e) => e.id)).toEqual(['p1', 'r1', 'r2', 'a1']);
  });

  it('finds by keyword and detail, ranks a hit in the label first', () => {
    expect(filterEntries(entries, 'bsm').map((e) => e.id)).toEqual(['c1']);
    expect(filterEntries(entries, 'küche').map((e) => e.id)).toEqual(['r2', 'c2']);
    expect(filterEntries(entries, 'wzlicht').map((e) => e.id)).toEqual(['c1']);
  });

  it('finds nothing for words that match no entry', () => {
    expect(filterEntries(entries, 'garage')).toEqual([]);
  });

  it('limits a group to eight entries when searching', () => {
    const many = Array.from({ length: 20 }, (_, i) => entry(`c${i}`, 'channels', `Lampe ${i}`));
    expect(filterEntries(many, 'lampe')).toHaveLength(8);
  });
});

describe('moveActive', () => {
  it('goes around the ends', () => {
    expect(moveActive(0, -1, 3)).toBe(2);
    expect(moveActive(2, 1, 3)).toBe(0);
    expect(moveActive(0, 1, 0)).toBe(0);
  });
});

describe('isPaletteShortcut', () => {
  it('takes Ctrl+K and Cmd+K, not K alone or with Alt', () => {
    expect(isPaletteShortcut({ key: 'k', ctrlKey: true, metaKey: false, altKey: false })).toBe(true);
    expect(isPaletteShortcut({ key: 'K', ctrlKey: false, metaKey: true, altKey: false })).toBe(true);
    expect(isPaletteShortcut({ key: 'k', ctrlKey: false, metaKey: false, altKey: false })).toBe(false);
    expect(isPaletteShortcut({ key: 'k', ctrlKey: true, metaKey: false, altKey: true })).toBe(false);
  });
});
