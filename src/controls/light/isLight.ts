import { useTrades } from '../../queries';
import type { Channel } from '../../types/types';

// Switch actuators drive lamps as well as pumps, valves or heaters; the
// channel type doesn't tell. The tile chosen in the setup area decides;
// without one, a switch counts as light when it is in a trade like
// "Licht" or its name sounds like one.
const LIGHT_NAME = /licht|lampe|leuchte|leuchter|beleuchtung|strahler|spot|light|lamp|\bled\b/i;
const LIGHT_TRADE = /licht|light|beleuchtung|lighting/i;

export const isLight = (channel: Channel, lightTradeIds: Set<number>) =>
  channel.tile
    ? channel.tile === 'light'
    : LIGHT_NAME.test(channel.name) || (channel.trades ?? []).some((id) => lightTradeIds.has(id));

export const useLightTradeIds = () => {
  const { data: trades = [] } = useTrades();
  return new Set(trades.filter((t) => LIGHT_TRADE.test(t.name)).map((t) => Number(t.id)));
};
