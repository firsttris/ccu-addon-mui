import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import de from '../../messages/de.json';

// Paraglide falls back to English for a text missing in German; this makes
// a missing translation fail instead.
describe('messages', () => {
  it('has the same texts in every language', () => {
    const keys = (messages: Record<string, string>) => Object.keys(messages).filter((k) => k !== '$schema').sort();
    expect(keys(de)).toEqual(keys(en));
  });

  it('has no empty texts', () => {
    for (const messages of [en, de] as Record<string, string>[]) {
      for (const [key, text] of Object.entries(messages)) {
        expect(text.trim(), key).not.toBe('');
      }
    }
  });
});
