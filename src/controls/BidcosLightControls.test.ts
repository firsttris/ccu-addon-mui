import { describe, expect, it } from 'vitest';
import { colorToHue, hueToColor, RGBW_WHITE } from './BidcosLightControls';

describe('RGBW_COLOR', () => {
  it('maps 0..199 to the hues like rgbw.fn', () => {
    expect(colorToHue(0)).toBe(0);
    expect(colorToHue(199)).toBe(360);
    expect(colorToHue(100)).toBe(181);
    expect(hueToColor(180)).toBe(100);
    expect(hueToColor(360)).toBe(0);
  });

  it('keeps white at 200 out of the hues', () => {
    expect(RGBW_WHITE).toBe(200);
    expect(colorToHue(RGBW_WHITE)).toBe(360);
  });
});
