import { describe, expect, it } from 'vitest';
import { describeServiceMessage, ServiceTexts } from '../ServiceMessages';
import texts from './texts.json';

describe('describeServiceMessage', () => {
  it('keeps our own short texts', () => {
    expect(describeServiceMessage({ type: 'LOWBAT' }, texts as ServiceTexts).severity).toBe('warning');
  });

  it('reads other messages as the WebUI does (stringtable_de.txt)', () => {
    expect(describeServiceMessage({ type: 'EMERGENCY_OPERATION' }, texts as ServiceTexts).label).toMatch(
      /^(Verbindungsabbruch zum RBG|Connection failure with room control unit)$/,
    );
  });

  it('keeps the CCU name while the texts load or for unknown types', () => {
    expect(describeServiceMessage({ type: 'EMERGENCY_OPERATION' }).label).toBe('EMERGENCY_OPERATION');
    expect(describeServiceMessage({ type: 'NO_SUCH' }, texts as ServiceTexts).label).toBe('NO_SUCH');
  });
});
