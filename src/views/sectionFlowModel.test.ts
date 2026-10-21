import { describe, expect, it } from 'vitest';
import { sectionColumns, sectionFlex } from './sectionFlowModel';

describe('sectionColumns', () => {
  it('counts a wide tile twice', () => {
    expect(sectionColumns([{}, { span: 2 }, { span: 1 }])).toBe(4);
  });
});

describe('sectionFlex', () => {
  it('starts as wide as the tiles at their narrowest, with the gaps between them', () => {
    // Four lights of 150 px: 4 × 150 + 3 × 12
    expect(sectionFlex(150, 4).flex).toBe('1 1 636px');
  });

  it('grows by at most a fifth, or across a page too narrow for one more tile', () => {
    // One thermostat of 232 px: at most 278 px, unless the page is
    // narrower than 232 + 12 + 232
    expect(sectionFlex(232, 1).maxWidth).toBe('min(100%, max(278px, (476px - 100%) * 1000))');
  });

  it('takes a section without tiles as one column', () => {
    expect(sectionFlex(240, 0).flex).toBe('1 1 240px');
  });
});
