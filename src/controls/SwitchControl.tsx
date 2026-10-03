import { SwitchVirtualReceiverChannel } from '../types/types';
import { useSetDataPoint } from '../queries';
import EmojioneLightBulb from '~icons/emojione/light-bulb';
import EmojioneMonotoneLightBulb from '~icons/emojione-monotone/light-bulb';

interface ControlProps {
  channel: SwitchVirtualReceiverChannel;
}

export const SwitchControl = ({ channel }: ControlProps) => {
  const setDataPoint = useSetDataPoint();
  const { datapoints, name, address, interfaceName } = channel;
  const checked = datapoints.STATE === true;

  const onHandleChange = async () => {
    setDataPoint(interfaceName, address, 'STATE', checked ? false : true);
  };

  return (
    <div className="flex flex-col items-center cursor-pointer p-[10px] w-[100px]" onClick={onHandleChange}>
      <div className="whitespace-normal overflow-hidden text-ellipsis max-w-[100px] h-[35px] text-[13px]">{name}</div>
      <div className={`mt-[10px] ${checked ? 'drop-shadow-[0_0_8px_rgba(255,255,0,0.6)]' : ''}`}>
        {checked ? <EmojioneLightBulb /> : <EmojioneMonotoneLightBulb />}
      </div>
    </div>
  );
};
