import { useChannelList, useLogicAction, useSysvars } from '../../queries';
import { useToast } from '../../contexts/ToastContext';
import { SysvarControl } from '../Logic';
import { m } from '../../paraglide/messages';
import type { Sysvar } from '../../types/types';

// The system variables assigned to the device's channels, with the names of
// their channels
export const useDeviceSysvars = (address: string) => {
  const { data: sysvars = [] } = useSysvars();
  const { data: channels = [] } = useChannelList();
  const names = new Map(channels.filter((c) => c.address.startsWith(`${address}:`)).map((c) => [c.id, c.name]));
  return { assigned: sysvars.filter((sv) => sv.channel !== undefined && names.has(sv.channel)), names };
};

// Operating them here, as the WebUI shows them with their channel
// (datapointconfigurator.fn)
export const DeviceSysvars = ({ assigned, names }: { assigned: Sysvar[]; names: Map<number, string> }) => {
  const action = useLogicAction();
  const { showToast } = useToast();
  return (
    <ul aria-label={m.SYSVARS()} className="flex flex-col divide-y rounded-lg border">
      {assigned.map((sysvar) => (
        <li key={sysvar.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
          <span className="flex flex-col gap-0.5">
            <span className="font-medium">{sysvar.name}</span>
            <span className="text-xs text-muted-foreground">{names.get(sysvar.channel!)}</span>
          </span>
          <span className="flex items-center gap-2">
            <SysvarControl
              sysvar={sysvar}
              onSet={(value) =>
                action.mutate(
                  { type: 'setSysvar', id: sysvar.id, value },
                  { onError: (error) => showToast(`${m.SET_FAILED()}: ${error.message}`) },
                )
              }
            />
          </span>
        </li>
      ))}
    </ul>
  );
};
