import { describe, expect, it } from 'vitest';
import { groupName, withGroupNames } from './groupNames';

describe('groupName', () => {
  it('translates the default rooms and trades of the CCU', () => {
    // Tests run in English (baseLocale)
    expect(groupName('roomGarden')).toBe('Garden');
    expect(groupName('roomGarage')).toBe('Garage');
    expect(groupName('funcSecurity')).toBe('Security');
    expect(groupName('funcCentral')).toBe('Central unit');
  });

  it('keeps names given by the user', () => {
    expect(groupName('Garten')).toBe('Garten');
    expect(groupName('roomgarden')).toBe('roomgarden');
    expect(groupName('toString')).toBe('toString');
  });

  it('translates a list and keeps the other fields', () => {
    expect(
      withGroupNames([
        { id: 7, name: 'funcLight' },
        { id: 8, name: 'Keller' },
      ]),
    ).toEqual([
      { id: 7, name: 'Light' },
      { id: 8, name: 'Keller' },
    ]);
  });
});
