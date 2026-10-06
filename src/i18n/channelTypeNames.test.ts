import { describe, expect, it } from 'vitest';
import de from '../../messages/de.json';
import { controlOverrides } from '../controls/registry';
import { channelTypeName } from './channelTypeNames';

describe('channelTypeName', () => {
  it('names every channel type of the registry that has a text', () => {
    // A text added to messages/*.json for a channel type must go into the
    // table too, or the dashboard shows the technical name
    const texts = de as Record<string, string>;
    for (const type of Object.keys(controlOverrides)) {
      if (texts[type] === undefined) continue;
      expect(channelTypeName(type), type).not.toBe(type);
    }
  });

  it('shows the technical name of a type without a text', () => {
    expect(channelTypeName('SOME_NEW_TRANSMITTER')).toBe('SOME_NEW_TRANSMITTER');
  });
});
