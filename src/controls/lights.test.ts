import { describe, expect, it } from 'vitest';
import { hsvToRgb, kelvinToRgb } from './ColorLightControl';
import { keyLabels } from './ButtonsControl';

describe('hsvToRgb', () => {
  it('converts the primary hues', () => {
    expect(hsvToRgb(0, 1)).toEqual([255, 0, 0]);
    expect(hsvToRgb(120, 1)).toEqual([0, 255, 0]);
    expect(hsvToRgb(240, 1)).toEqual([0, 0, 255]);
    expect(hsvToRgb(360, 1)).toEqual([255, 0, 0]);
    expect(hsvToRgb(30, 0)).toEqual([255, 255, 255]);
  });
});

describe('kelvinToRgb', () => {
  it('is warm at low and bluish at high temperatures', () => {
    const [r1, , b1] = kelvinToRgb(2700);
    const [r2, , b2] = kelvinToRgb(6500);
    expect(r1).toBe(255);
    expect(b1).toBeLessThan(200);
    expect(b2).toBeGreaterThan(b1);
    expect(r2).toBeGreaterThan(240);
  });
});

describe('keyLabels', () => {
  it('takes what all keys share as the title', () => {
    expect(keyLabels(['Wandtaster Flur oben', 'Wandtaster Flur unten'])).toEqual({
      title: 'Wandtaster Flur',
      labels: ['oben', 'unten'],
    });
  });

  it('cuts only at word boundaries and keeps single keys', () => {
    expect(keyLabels(['Taster1', 'Taster2'])).toEqual({ title: 'Taster1', labels: ['Taster1', 'Taster2'] });
    expect(keyLabels(['Klingel'])).toEqual({ title: 'Klingel', labels: ['Klingel'] });
  });
});
