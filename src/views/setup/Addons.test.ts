import { describe, expect, it } from 'vitest';
import { addonUrl } from './Addons';

describe('Addons', () => {
  it('opens config URLs on the CCU', () => {
    expect(addonUrl('/addons/cuxd/')).toBe('/addons/cuxd/');
    expect(addonUrl('https://example.com/x')).toBe('https://example.com/x');
  });
});
