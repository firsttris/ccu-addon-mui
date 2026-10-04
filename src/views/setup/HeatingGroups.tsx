import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import ExternalLinkIcon from '~icons/lucide/external-link';
import { useWebSocketActions } from '../../hooks/useWebsocket';
import { useDevices } from '../../queries';
import { usePageTitle } from '../../contexts/PageTitleContext';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { ListSkeletonItems } from '../../components/ui/skeleton';
import { WEBUI_URL } from '../../components/WebUILink';
import { m } from '../../paraglide/messages';
import { Panel } from './Panel';
import { useChannelNames } from './channelNames';

// The heating groups the HMServer keeps in groups.gson, as the WebUI reads
// them (CCU.getHeatingGroupList): members and the group's own device, which
// is operated and set up like any device. Creating and changing groups
// stays in the WebUI ("Einstellungen › Gruppen").
export const HeatingGroups = () => {
  usePageTitle(m.SETUP());
  const { request } = useWebSocketActions();
  const { data: groups, isPending } = useQuery({
    queryKey: ['heatingGroups'],
    queryFn: async () => (await request({ type: 'getHeatingGroups' })).groups,
  });
  const { data: devices = [] } = useDevices();
  const names = useChannelNames();
  const deviceOf = (address: string) => devices.find((d) => d.address === address);

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{m.HG_TITLE()}</h1>
        <p className="text-sm text-muted-foreground">{m.HG_HINT()}</p>
      </div>
      <Panel aria-label={m.HG_TITLE()}>
        <ul aria-label={m.HG_TITLE()} className="flex flex-col divide-y rounded-lg border">
          {isPending && <ListSkeletonItems rows={2} />}
          {groups?.map((group) => {
            const device = group.deviceAddress ? deviceOf(group.deviceAddress) : undefined;
            return (
              <li key={group.id} aria-label={group.name} className="flex flex-col gap-2 px-3 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{group.name}</span>
                  <Badge variant="secondary">{group.type.startsWith('hmip') ? 'HomeMatic IP' : 'HomeMatic'}</Badge>
                  {group.forbidSingleOperation && <Badge variant="outline">{m.HG_FORBID_SINGLE()}</Badge>}
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">{m.HG_DEVICE()}: </span>
                  {device ? (
                    <Link
                      to="/device/$interfaceName/$address"
                      params={{ interfaceName: device.interfaceName, address: device.address }}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {device.name ?? group.deviceName}
                    </Link>
                  ) : (
                    <span>{group.deviceName || '–'}</span>
                  )}
                </div>
                {group.members.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{m.HG_NO_MEMBERS()}</p>
                ) : (
                  <ul aria-label={m.HG_MEMBERS({ name: group.name })} className="flex flex-col gap-0.5 text-sm">
                    {group.members.map((member) => {
                      const memberDevice = deviceOf(member.address.split(':')[0]);
                      const label = names.get(member.address) ?? member.address;
                      return (
                        <li key={member.address} className="flex flex-wrap items-baseline gap-x-2">
                          {memberDevice ? (
                            <Link
                              to="/device/$interfaceName/$address"
                              params={{ interfaceName: memberDevice.interfaceName, address: memberDevice.address }}
                              className="underline-offset-4 hover:underline"
                            >
                              {label}
                            </Link>
                          ) : (
                            <span>{label}</span>
                          )}
                          <span className="font-mono text-xs text-muted-foreground">{member.address}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
          {!isPending && groups?.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">{m.HG_NONE()}</li>}
        </ul>
        <div>
          <Button variant="outline" asChild>
            <a href={WEBUI_URL} target="_blank" rel="noopener noreferrer">
              <ExternalLinkIcon />
              {m.HG_EDIT_IN_WEBUI()}
            </a>
          </Button>
        </div>
      </Panel>
    </>
  );
};
