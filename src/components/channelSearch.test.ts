import { describe, expect, it } from 'vitest';
import { matchScore } from './channelSearch';

const fields = ['Wohnzimmer Licht', 'HmIP-BSM', 'Schaltaktor', '000855699C4F38:4', 'Wohnzimmer'];

describe('matchScore', () => {
  it('matches every word, in any order, contained', () => {
    expect(matchScore('licht wohn', fields)).toBeGreaterThan(0);
    expect(matchScore('bsm', fields)).toBeGreaterThan(0);
    expect(matchScore('9C4F', fields)).toBeGreaterThan(0);
    expect(matchScore('licht küche', fields)).toBe(0);
  });

  it('finds letters in order and ranks it below contained words', () => {
    expect(matchScore('wzlicht', fields)).toBeGreaterThan(0);
    expect(matchScore('wzlicht', fields)).toBeLessThan(matchScore('licht', fields));
  });

  it('does not gather letters from far apart', () => {
    expect(matchScore('taster', ['Wandthermostat Flur', 'HmIP-WTH-2', 'Thermostat'])).toBe(0);
  });

  it('ignores case and accents', () => {
    expect(matchScore('KUCHE', ['Küche Rollo'])).toBeGreaterThan(0);
    expect(matchScore('strasse', ['Straße Licht'])).toBeGreaterThan(0);
  });

  it('matches all for an empty query', () => {
    expect(matchScore('  ', fields)).toBe(1);
  });
});
