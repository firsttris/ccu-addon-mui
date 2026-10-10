import { describe, expect, it } from 'vitest';
import { parameterLabel } from './parameters';
import webUILabels from './parameterLabels.json';

describe('parameterLabel', () => {
  it('takes the catalog first: it tells apart what the WebUI names alike', () => {
    expect(parameterLabel('REFERENCE_RUNNING_TIME_TOP_BOTTOM_VALUE')).not.toBe(
      parameterLabel('REFERENCE_RUNNING_TIME_BOTTOM_TOP_VALUE'),
    );
  });

  it("uses the WebUI's name for a parameter the catalog doesn't know", () => {
    // From webui.js elvST, not in the catalog
    const name = 'CURRENT';
    expect([webUILabels.de[name], webUILabels.en[name]]).toContain(parameterLabel(name));
  });

  it('makes an unknown technical name readable', () => {
    expect(parameterLabel('SOME_NEW_PARAMETER')).toBe('Some new parameter');
  });
});
