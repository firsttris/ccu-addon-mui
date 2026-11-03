import { describe, expect, it } from 'vitest';
import {
  filterEntries,
  isApplePlatform,
  isPaletteShortcut,
  moveActive,
  type PaletteEntry,
  paletteShortcutLabel,
} from './commandPaletteModel';

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
  const key = (extra: Partial<KeyboardEvent>) => ({
    key: 'k',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...extra,
  });

  it('takes Ctrl+K off a Mac, not Cmd+K, K alone or with Alt or Shift', () => {
    expect(isPaletteShortcut(key({ ctrlKey: true }), false)).toBe(true);
    expect(isPaletteShortcut(key({ key: 'K', ctrlKey: true }), false)).toBe(true);
    expect(isPaletteShortcut(key({ metaKey: true }), false)).toBe(false);
    expect(isPaletteShortcut(key({}), false)).toBe(false);
    expect(isPaletteShortcut(key({ ctrlKey: true, altKey: true }), false)).toBe(false);
    expect(isPaletteShortcut(key({ ctrlKey: true, shiftKey: true }), false)).toBe(false);
  });

  it('takes Cmd+K on a Mac and leaves Ctrl+K to the text field', () => {
    expect(isPaletteShortcut(key({ metaKey: true }), true)).toBe(true);
    expect(isPaletteShortcut(key({ ctrlKey: true }), true)).toBe(false);
  });
});

describe('isApplePlatform', () => {
  it('tells a Mac or iPad from Windows and Linux', () => {
    expect(isApplePlatform({ platform: 'MacIntel' })).toBe(true);
    expect(isApplePlatform({ platform: 'iPad' })).toBe(true);
    expect(isApplePlatform({ platform: '', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)' })).toBe(true);
    expect(isApplePlatform({ platform: 'Win32' })).toBe(false);
    expect(isApplePlatform({ platform: 'Linux x86_64' })).toBe(false);
  });

  it('names the shortcut of the platform', () => {
    expect(paletteShortcutLabel(true)).toBe('⌘K');
    expect(paletteShortcutLabel(false)).toBe('Ctrl+K');
  });
});
