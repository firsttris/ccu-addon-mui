import { describe, expect, it } from 'vitest';
import { controlOverrides } from './registry';
import { isHiddenChannel } from '../hooks/channels';
import { Channel } from '../types/types';
import { displayConfigString, emptyLine, encodeDisplayText, rc19Writes } from './DisplayControls';

const noSound = { selection: -1, repetitions: 0, interval: 5 };

describe('HmIP-WRCD display', () => {
  it('builds COMBINED_PARAMETER as the WebUI dialog', () => {
    const lines = Array.from({ length: 5 }, emptyLine);
    lines[0] = { ...lines[0], text: 'Hallo' };
    lines[2] = { ...lines[2], icon: 10, align: 'LEFT', background: 'BLACK', color: 'WHITE' };
    expect(displayConfigString(lines, noSound)).toBe(
      '{DDBC=WHITE,DDTC=BLACK,DDI=0,DDA=CENTER,DDS=Hallo,DDID=1},' +
        '{DDBC=BLACK,DDTC=WHITE,DDI=10,DDA=LEFT,DDS=,DDID=3,DDC=true}',
    );
    expect(displayConfigString(lines, { selection: 6, repetitions: 2, interval: 10 })).toBe(
      '{DDBC=WHITE,DDTC=BLACK,DDI=0,DDA=CENTER,DDS=Hallo,DDID=1},' +
        '{DDBC=BLACK,DDTC=WHITE,DDI=10,DDA=LEFT,DDS=,DDID=3,DDC=true},{R=2,IN=10,ANS=6}',
    );
  });

  it('sends a sound alone, a reset, or nothing', () => {
    const lines = Array.from({ length: 5 }, emptyLine);
    expect(displayConfigString(lines, { selection: 0, repetitions: 15, interval: 5 })).toBe('{R=15,IN=5,ANS=0}');
    expect(displayConfigString(lines, noSound, true)).toBe('{DDS=XXX,DDID=1,DDC=true}');
    expect(displayConfigString(lines, noSound)).toBe('');
  });

  it('maps the characters the display lacks', () => {
    expect(encodeDisplayText("Küche & Bäd'Öl")).toBe('K³che ] B²dµ#l');
    expect(encodeDisplayText('21,5 °C {a}=b"')).toBe('21.5 °C ab');
  });
});

describe('HM-RC-19 display', () => {
  it('writes in the order of saveDisplayValues, SUBMIT last', () => {
    expect(rc19Writes({ text: '21.5xyz', unit: 3, backlight: 1, beep: 2, symbols: ['BELL', 'BULB'] })).toEqual([
      ['TEXT', '21.5x'],
      ['BEEP', 2],
      ['UNIT', 3],
      ['BACKLIGHT', 1],
      ['BULB', true],
      ['BELL', true],
      ['SUBMIT', true],
    ]);
  });
});

describe('display channels', () => {
  it('registers the displays and hides the WGD channels as functions.fn', () => {
    expect(controlOverrides.ACOUSTIC_DISPLAY_RECEIVER?.section).toBe('buttons');
    expect(controlOverrides.DISPLAY?.section).toBe('buttons');
    const channel = (type: string) =>
      ({ type, name: 'x', address: 'A:1', datapoints: { PRESS_SHORT: false } }) as unknown as Channel;
    expect(isHiddenChannel(channel('DISPLAY_INPUT_TRANSMITTER'))).toBe(true);
    expect(isHiddenChannel(channel('WEATHER_DISPLAY_RECEIVER'))).toBe(true);
    expect(isHiddenChannel(channel('ACOUSTIC_DISPLAY_RECEIVER'))).toBe(false);
  });
});
