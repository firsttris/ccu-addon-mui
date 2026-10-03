import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useWebSocketActions } from '../../hooks/useWebsocket';
import { PanelSkeleton } from '../../components/ui/skeleton';
import { useChannelNames } from './channelNames';
import { m } from '../../paraglide/messages';

// The programs that use a channel of the device, as the WebUI's "Programme"
// button in the device list (Channel.listProgramIds)
export const DevicePrograms = ({ address }: { address: string }) => {
  const { request } = useWebSocketActions();
  const names = useChannelNames();
  const { data: programs, isPending } = useQuery({
    queryKey: ['devicePrograms', address],
    queryFn: async () => (await request({ type: 'getDevicePrograms', address })).programs,
  });

  if (isPending) {
    return <PanelSkeleton lines={2} />;
  }
  if (!programs || programs.length === 0) {
    return <p>{m.DEVICE_PROGRAMS_NONE()}</p>;
  }
  return (
    <ul aria-label={m.PROGRAMS()} className="flex flex-col divide-y rounded-lg border">
      {programs.map((program) => (
        <li key={program.id} className="flex flex-col gap-0.5 px-3 py-2.5">
          <Link
            to="/program/$programId"
            params={{ programId: String(program.id) }}
            className="font-medium underline-offset-4 hover:underline"
          >
            {program.name}
          </Link>
          <span className="text-xs text-muted-foreground">
            {program.channels.map((channel) => names.get(channel) ?? channel).join(', ')}
          </span>
        </li>
      ))}
    </ul>
  );
};
