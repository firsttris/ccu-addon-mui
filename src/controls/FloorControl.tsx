import { CSSProperties } from 'react';
import { FloorClimateControlTransceiverChannel } from '../types/types';
import MdiPipeValve from '~icons/mdi/pipe-valve';
import { ChannelName } from '../components/ChannelName';
import { getPercentageColor, getPercentageGradient } from '../utils/colors';

interface FloorControlProps {
  channel: FloorClimateControlTransceiverChannel;
}

export const FloorControl = (props: FloorControlProps) => {
  const value = Math.round(Number(props.channel.datapoints.LEVEL) * 100);
  const color = getPercentageColor(value);
  // For the bar's pseudo elements
  const bar = {
    '--value': `${value}%`,
    '--gradient': getPercentageGradient(value),
    '--glow': `${color}40`,
  } as CSSProperties;

  return (
    <div className="w-[250px] p-4 rounded-xl">
      <ChannelName name={props.channel.name} maxWidth="250px" />
      <div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center justify-center transition-all duration-400 ease-[cubic-bezier(0.4,0,0.2,1)] drop-shadow-[0_2px_4px_rgba(0,0,0,0.1)] hover:scale-110 hover:rotate-[5deg]">
            <MdiPipeValve color={color} width={40} />
          </div>
          <div className="w-full relative">
            <div
              style={bar}
              className="h-[18px] bg-border rounded-[10px] overflow-hidden relative shadow-[inset_0_2px_4px_rgba(0,0,0,0.06)] after:content-[''] after:block after:w-(--value) after:h-full after:[background:var(--gradient)] after:rounded-[10px] after:[transition:width_0.6s_cubic-bezier(0.4,0,0.2,1),background_0.4s_ease-in-out] after:shadow-[0_2px_6px_var(--glow)] after:relative after:overflow-hidden before:content-[''] before:absolute before:top-0 before:left-0 before:w-(--value) before:h-full before:bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.3),transparent)] before:animate-shimmer before:z-[1] before:transition-[width] before:duration-600 before:ease-[cubic-bezier(0.4,0,0.2,1)]"
            />
          </div>
          <span
            style={{ color }}
            className="text-[13px] font-semibold min-w-10 text-right transition-[color] duration-400 ease-in-out tracking-[0.5px]"
          >{`${value}%`}</span>
        </div>
      </div>
    </div>
  );
};
