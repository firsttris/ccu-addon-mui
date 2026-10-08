import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useWebSocketActions, useWebSocketContext } from '../hooks/useWebsocket';
import { useConfigChange, useSetDataPoint } from '../queries';
import { EditableName } from '../components/EditableName';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Switch } from '../components/ui/switch';
import { Label } from '../components/ui/label';
import { useToast } from '../contexts/ToastContext';
import { usePageTitle } from '../contexts/PageTitleContext';
import { Controls, Item, List, Name } from './Logic';
import { m } from '../paraglide/messages';
import type { VirtualKey } from '../types/protocol';
import { errorText } from '../lib/errors';

// A key still named as the CCU created it ("HM-RCV-50 BidCoS-RF:7",
// "HmIP-RCV-50 HmIP-RCV-1:7")
export const isDefaultName = (key: VirtualKey) => /^(HM|HmIP)-RCV-50 /.test(key.name) || key.name === key.address;

// The CCU's own virtual keys: programs react to them like to a wall
// button. Pressed here short or long, as the WebUI's device list lets one
// press them; renamed by administrators.
export const VirtualKeys = () => {
  usePageTitle(m.VKEYS_TITLE());
  const { request } = useWebSocketActions();
  const { userLevel, elevated } = useWebSocketContext();
  const { showToast } = useToast();
  const setDataPoint = useSetDataPoint();
  const change = useConfigChange();
  const [all, setAll] = useState(false);
  const { data: keys = [], isPending, refetch } = useQuery({
    queryKey: ['virtualKeys'],
    queryFn: async () => (await request({ type: 'getVirtualKeys' })).keys,
  });

  const canRename = userLevel === 'admin' && elevated;
  const canPress = userLevel === 'admin' || userLevel === 'user';
  const shown = all ? keys : keys.filter((key) => !isDefaultName(key) || key.programs > 0);

  const press = (key: VirtualKey, long: boolean) => {
    setDataPoint(key.interfaceName, key.address, long ? 'PRESS_LONG' : 'PRESS_SHORT', true);
    showToast(m.VKEYS_PRESSED({ name: key.name }), 'info');
  };

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{m.VKEYS_TITLE()}</h1>
        <p className="text-sm text-muted-foreground">{m.VKEYS_HINT()}</p>
      </div>
      <div className="flex items-center gap-2">
        <Switch id="vkeys-all" checked={all} onCheckedChange={setAll} />
        <Label htmlFor="vkeys-all" className="font-normal">
          {m.VKEYS_SHOW_ALL({ count: keys.length })}
        </Label>
      </div>
      <List aria-label={m.VKEYS_TITLE()} loading={isPending}>
        {shown.map((key) => (
          <Item key={key.address}>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              {canRename ? (
                <EditableName
                  name={key.name}
                  onRename={(name) =>
                    change.mutate(
                      { type: 'rename', address: key.address, name },
                      {
                        onSuccess: () => {
                          showToast(m.RENAMED(), 'info');
                          refetch();
                        },
                        onError: (error) => showToast(errorText(error, m.CHANGE_FAILED)),
                      },
                    )
                  }
                />
              ) : (
                <Name>{key.name}</Name>
              )}
              <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-mono">{key.address}</span>
                {key.programs > 0 && <Badge variant="secondary">{m.VKEYS_PROGRAMS({ count: key.programs })}</Badge>}
              </span>
            </div>
            {canPress && (
              <Controls>
                <Button type="button" variant="outline" size="sm" aria-label={`${m.VKEYS_SHORT()} ${key.name}`} onClick={() => press(key, false)}>
                  {m.VKEYS_SHORT()}
                </Button>
                <Button type="button" variant="outline" size="sm" aria-label={`${m.VKEYS_LONG()} ${key.name}`} onClick={() => press(key, true)}>
                  {m.VKEYS_LONG()}
                </Button>
              </Controls>
            )}
          </Item>
        ))}
      </List>
    </div>
  );
};
