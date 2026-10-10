import { useEffect, useRef, useState } from 'react';
import CircleDotIcon from '~icons/lucide/circle-dot';
import ToggleLeftIcon from '~icons/lucide/toggle-left';
import DoorOpenIcon from '~icons/lucide/door-open';
import DoorClosedIcon from '~icons/lucide/door-closed';
import GaugeIcon from '~icons/lucide/gauge';
import CircleOffIcon from '~icons/lucide/circle-off';
import type { Channel, DatapointValue } from '../types/types';
import { m } from '../paraglide/messages';
import { DetectorTile, type Tone } from './DetectorControls';

// What an input is wired to, the WebUI's metadata "channelMode"
// (translate.lang.channelDescription.js, chType_MULTI_MODE_INPUT_TRANSMITTER_*)
export type InputMode = 0 | 1 | 2 | 3 | 4 | 5;

const modeLabel: Record<InputMode, () => string> = {
  0: m.INPUT_MODE_0,
  1: m.INPUT_MODE_1,
  2: m.INPUT_MODE_2,
  3: m.INPUT_MODE_3,
  4: m.INPUT_MODE_4,
  5: m.INPUT_MODE_5,
};

// Without metadata the channel is a key, as after pairing (functions.fn)
export const inputMode = (channel: Channel): InputMode => {
  const mode = channel.mode;
  return mode !== undefined && mode >= 0 && mode <= 5 ? (mode as InputMode) : 1;
};

// A contact reports STATE (or VALUE_8BIT on newer channels) 1/true/200 open
// and 0/false closed, as the WebUI's iseButtonsDoorContact reads it
// (door_window_contact.fn)
export const contactOpen = (channel: Channel): boolean | undefined => {
  const dp = channel.datapoints as Record<string, DatapointValue>;
  const value = dp.STATE ?? dp.VALUE_8BIT;
  if (value === true || value === 1 || value === 200) return true;
  if (value === false || value === 0) return false;
  return undefined;
};

type Press = 'short' | 'long';

// The last press reported while the tile is shown; lights up for a moment
const usePress = (channel: Channel) => {
  const dp = channel.datapoints as Record<string, DatapointValue>;
  const [press, setPress] = useState<Press | null>(null);
  const [active, setActive] = useState(false);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const kind = dp.PRESS_LONG === true ? 'long' : dp.PRESS_SHORT === true ? 'short' : null;
    if (!kind) return;
    setPress(kind);
    setActive(true);
    const timer = setTimeout(() => setActive(false), 1500);
    return () => clearTimeout(timer);
  }, [dp]);
  return { press, active };
};

// Inputs of contact interfaces and actuators (HmIP-FCI1/FCI6, -DSD-PCB, the
// inputs of -BSL, -DRSI4 …). They are set up as key, switch or contact
// (CHANNEL_OPERATION_MODE), and the tile shows what fits: presses light up,
// a contact shows open or closed, a level its value. Like the WebUI, which
// has no control for them (datapointconfigurator.fn), nothing is sent.
export const InputControl = ({ channel }: { channel: Channel }) => {
  const mode = inputMode(channel);
  const { press, active } = usePress(channel);
  const dp = channel.datapoints as Record<string, DatapointValue>;

  let tone: Tone = 'calm';
  let icon = <CircleDotIcon />;
  let status: string = m.INPUT_WAITING();
  switch (mode) {
    case 0:
    case 5:
      icon = <CircleOffIcon />;
      status = m.INPUT_NO_FUNCTION();
      break;
    case 1:
      tone = active ? 'active' : 'calm';
      if (press) status = press === 'long' ? m.INPUT_PRESSED_LONG() : m.INPUT_PRESSED_SHORT();
      break;
    case 2:
      icon = <ToggleLeftIcon />;
      tone = active ? 'active' : 'calm';
      if (press) status = m.INPUT_SWITCHED();
      break;
    case 3: {
      const open = contactOpen(channel);
      icon = open ? <DoorOpenIcon /> : <DoorClosedIcon />;
      tone = open ? 'active' : 'calm';
      status = open === undefined ? m.WINDOW_UNKNOWN() : open ? m.WINDOW_STATE_OPEN() : m.WINDOW_CLOSED();
      break;
    }
    case 4: {
      icon = <GaugeIcon />;
      const value = dp.VALUE_8BIT;
      status = typeof value === 'number' ? String(value) : m.WINDOW_UNKNOWN();
      break;
    }
  }

  return (
    <DetectorTile channel={channel} tone={tone} waves={active} icon={icon} status={status} detail={modeLabel[mode]()} />
  );
};
