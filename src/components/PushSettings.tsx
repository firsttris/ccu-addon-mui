import { useEffect, useState } from 'react';
import { useWebSocketActions } from '../hooks/useWebsocket';
import { useToast } from '../contexts/ToastContext';
import { currentSubscription, pushSupport, subscribe } from '../lib/push';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { Button } from './ui/button';
import { getLocale } from '../paraglide/runtime';
import { m } from '../paraglide/messages';

// Push notifications of this device about new alarms and service messages
// and the notification rules
export const PushSettings = ({ onOpenRules }: { onOpenRules?: () => void }) => {
  const { request } = useWebSocketActions();
  const { showToast } = useToast();
  const support = pushSupport();
  const [state, setState] = useState<{ endpoint?: string; alarms: boolean; service: boolean; rules: boolean; key?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const subscription = support === 'ok' ? await currentSubscription().catch(() => null) : null;
      const status = await request({ type: 'getPush', endpoint: subscription?.endpoint ?? '' });
      if (active) {
        setState({
          endpoint: status.subscribed ? subscription?.endpoint : undefined,
          alarms: status.subscribed && status.alarms,
          service: status.subscribed && status.service,
          rules: status.subscribed && !!status.rules,
          key: status.publicKey,
        });
      }
    })().catch(() => active && setState(null));
    return () => {
      active = false;
    };
  }, [request, support]);

  const update = async (change: Partial<Record<'alarms' | 'service' | 'rules', boolean>>) => {
    if (!state?.key) return;
    const { alarms, service, rules } = { ...state, ...change };
    setBusy(true);
    try {
      if (!alarms && !service && !rules) {
        if (state.endpoint) await request({ type: 'unsubscribePush', endpoint: state.endpoint });
        setState({ ...state, endpoint: undefined, alarms, service, rules });
        return;
      }
      const subscription = await subscribe(state.key);
      await request({
        type: 'subscribePush',
        subscription: subscription.toJSON() as never,
        alarms,
        service,
        rules,
        language: getLocale(),
        device: navigator.userAgent.slice(0, 120),
      });
      setState({ ...state, endpoint: subscription.endpoint, alarms, service, rules });
    } catch (error) {
      showToast(`${m.PUSH_FAILED()}: ${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const hint =
    support === 'insecure'
      ? m.PUSH_INSECURE()
      : support === 'unsupported'
        ? m.PUSH_UNSUPPORTED()
        : support === 'denied'
          ? m.PUSH_DENIED()
          : m.PUSH_HINT();
  const disabled = support !== 'ok' || !state?.key || busy;
  return (
    <div className="flex flex-col gap-1 px-3 pt-1">
      {[
        { id: 'push-alarms', label: m.PUSH_ALARMS(), checked: !!state?.alarms, set: (v: boolean) => update({ alarms: v }) },
        { id: 'push-service', label: m.PUSH_SERVICE(), checked: !!state?.service, set: (v: boolean) => update({ service: v }) },
        { id: 'push-rules', label: m.PUSH_RULES(), checked: !!state?.rules, set: (v: boolean) => update({ rules: v }) },
      ].map((row) => (
        <div key={row.id} className="flex h-11 items-center justify-between">
          <Label htmlFor={row.id} className="text-[15px] font-normal">
            {row.label}
          </Label>
          <Switch id={row.id} checked={row.checked} disabled={disabled} onCheckedChange={row.set} />
        </div>
      ))}
      <span className="text-xs text-muted-foreground">{hint}</span>
      {onOpenRules && (
        <button type="button" className="self-start text-xs text-primary underline-offset-2 hover:underline" onClick={onOpenRules}>
          {m.PUSH_RULES_OPEN()}
        </button>
      )}
      {state?.endpoint && (
        <Button
          variant="outline"
          size="sm"
          className="mt-2 self-start"
          onClick={() =>
            request({ type: 'testPush', endpoint: state.endpoint ?? '' })
              .then(() => showToast(m.PUSH_TEST_SENT(), 'info'))
              .catch((error: Error) => showToast(`${m.PUSH_FAILED()}: ${error.message}`))
          }
        >
          {m.PUSH_TEST()}
        </Button>
      )}
    </div>
  );
};
