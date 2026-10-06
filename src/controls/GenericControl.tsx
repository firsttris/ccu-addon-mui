import { DatapointValue, GenericChannel, ParamsetDescription } from '../types/types';
import { useParamsetDescription, useSetDataPoint } from '../queries';
import { ParamsetView, shownParameters } from './generic/ParamsetView';
import { defaultLang } from '../i18n/locale';
import { WebUILink } from '../components/WebUILink';
import { Tile } from '../components/Tile';
import { m } from '../paraglide/messages';

const numberFormat = new Intl.NumberFormat(defaultLang, { maximumFractionDigits: 2 });

interface ViewProps {
  channel: GenericChannel;
  // The channel's VALUES paramset description, if the CCU provides one
  description?: ParamsetDescription;
  onSet?: (name: string, value: string | number | boolean) => void;
}

// Fallback for channel types without their own control. With a paramset
// description, every parameter gets the element its type calls for;
// without one (still loading, or an interface without descriptions) the
// datapoints are shown read-only.
export const GenericControlView = ({ channel, description, onSet = () => {} }: ViewProps) => {
  const format = (value: DatapointValue) => {
    if (value === null || value === '') {
      return '–';
    }
    if (typeof value === 'boolean') {
      return value ? m.YES() : m.NO();
    }
    if (typeof value === 'number') {
      return numberFormat.format(value);
    }
    return value;
  };

  const datapoints = Object.entries(channel.datapoints).sort(([a], [b]) => a.localeCompare(b));

  return (
    <Tile status={channel.status}>
      <div className="flex flex-col gap-2 p-4">
        <div className="text-[15px] font-medium wrap-anywhere">{channel.name}</div>
        {description && shownParameters(description).length > 0 ? (
          <ParamsetView label={channel.name} description={description} values={channel.datapoints} onSet={onSet} />
        ) : (
          <dl aria-label={channel.name} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 m-0 text-[13px]">
            {datapoints.map(([key, value]) => (
              <div key={key} style={{ display: 'contents' }}>
                <dt title={key} className="overflow-hidden text-ellipsis whitespace-nowrap text-muted-foreground">
                  {key}
                </dt>
                <dd className="m-0 text-right tabular-nums text-foreground">{format(value)}</dd>
              </div>
            ))}
          </dl>
        )}
        <div className="mt-auto pt-1 text-right">
          <WebUILink />
        </div>
      </div>
    </Tile>
  );
};

export const GenericControl = ({ channel }: { channel: GenericChannel }) => {
  const { data: description } = useParamsetDescription(channel.interfaceName, channel.address);
  const setDataPoint = useSetDataPoint();
  return (
    <GenericControlView
      channel={channel}
      description={description}
      onSet={(name, value) => setDataPoint(channel.interfaceName, channel.address, name, value)}
    />
  );
};
