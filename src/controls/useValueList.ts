import { useParamsetDescription } from '../queries';
import type { Channel, DatapointValue } from '../types/types';

// Names of an enum datapoint's values from the channel's paramset
// description. `fallback` is the usual order, for showing a state while the
// description is missing; commands are only sent with the real list
// (`known`), so a device with another order is never sent a wrong one.
export const useValueList = (channel: Channel, datapoint: string, fallback: string[]) => {
  const { data } = useParamsetDescription(channel.interfaceName, channel.address);
  const list = data?.[datapoint]?.valueList;
  const names = list && list.length > 0 ? list : fallback;
  const value = (channel.datapoints as Record<string, DatapointValue>)[datapoint];
  return {
    known: Boolean(list && list.length > 0),
    // Name of the current value, e.g. "PRIMARY_ALARM"
    name:
      typeof value === 'number'
        ? names[value]
        : typeof value === 'string' && Number.isNaN(Number(value))
          ? value
          : undefined,
    indexOf: (name: string) => (list ?? []).indexOf(name),
  };
};
