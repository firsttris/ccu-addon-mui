import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import PlusIcon from '~icons/lucide/plus';
import PencilIcon from '~icons/lucide/pencil';
import TrashIcon from '~icons/lucide/trash-2';
import BellIcon from '~icons/lucide/bell';
import ClockIcon from '~icons/lucide/clock';
import { useWebSocketActions, useWebSocketContext } from '../../hooks/useWebsocket';
import { usePageTitle } from '../../contexts/PageTitleContext';
import { useToast } from '../../contexts/ToastContext';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Switch } from '../../components/ui/switch';
import { PanelSkeleton } from '../../components/ui/skeleton';
import { Panel } from '../setup/Panel';
import { m } from '../../paraglide/messages';
import type { NotificationRule } from '../../types/protocol';
import { RuleEditor } from './RuleEditor';
import { durationText, emptyRule, fromPreset, presets } from './ruleModel';
import { errorText } from '../../lib/errors';

const useRules = () => {
  const { request } = useWebSocketActions();
  return useQuery({
    queryKey: ['rules'],
    queryFn: async () => (await request({ type: 'getRules' })).rules ?? [],
  });
};

// Push notifications about states of devices, without a CCU program:
// administrators write the rules, every device chooses in the menu whether
// it receives them (Benachrichtigungen → Regeln)
export const Rules = () => {
  usePageTitle(m.RULES());
  const { request } = useWebSocketActions();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { userLevel, elevated } = useWebSocketContext();
  const canEdit = userLevel === 'admin' && elevated;
  const { data: rules } = useRules();
  const [editing, setEditing] = useState<NotificationRule | null>(null);
  const [deleting, setDeleting] = useState<NotificationRule | null>(null);

  const change = useMutation({
    mutationFn: async (action: { save: NotificationRule } | { delete: string }) =>
      'save' in action
        ? request({ type: 'saveRule', rule: action.save })
        : request({ type: 'deleteRule', id: action.delete }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rules'] }),
    onError: (error) => showToast(errorText(error, m.CHANGE_FAILED)),
  });

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{m.RULES()}</h1>
        {canEdit && (
          <Button type="button" onClick={() => setEditing(emptyRule())}>
            <PlusIcon />
            {m.RULE_NEW()}
          </Button>
        )}
      </div>
      {canEdit && (
        // biome-ignore lint/a11y/useSemanticElements: a fieldset brings its own border and spacing
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={m.RULE_PRESETS()}>
          <span className="text-sm text-muted-foreground">{m.RULE_PRESETS()}:</span>
          {presets.map((preset) => (
            <Button
              key={preset.key}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditing(fromPreset(preset))}
            >
              {preset.label()}
            </Button>
          ))}
        </div>
      )}
      {rules === undefined ? (
        <Panel aria-busy>
          <PanelSkeleton lines={4} />
        </Panel>
      ) : rules.length === 0 ? (
        <Panel>
          <p>{m.RULE_NONE()}</p>
        </Panel>
      ) : (
        <ul className="flex flex-col gap-3" aria-label={m.RULES()}>
          {rules.map((rule) => (
            <li key={rule.id} aria-label={rule.name}>
              <Panel className="flex-row items-start gap-4">
                <BellIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <h2 className="truncate">{rule.name}</h2>
                  <p>{rule.message || rule.summary}</p>
                  <span className="flex flex-wrap gap-1.5">
                    <Badge variant="secondary">
                      <ClockIcon className="size-3" />
                      {rule.minutes > 0 ? m.RULE_FOR({ duration: durationText(rule.minutes) }) : m.RULE_AT_ONCE()}
                    </Badge>
                    {rule.from && rule.to && (
                      <Badge variant="secondary">{m.RULE_BETWEEN({ from: rule.from, to: rule.to })}</Badge>
                    )}
                    {!rule.enabled && <Badge variant="warning">{m.RULE_OFF()}</Badge>}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Switch
                    aria-label={m.RULE_ENABLED({ name: rule.name })}
                    checked={rule.enabled}
                    disabled={!canEdit || change.isPending}
                    onCheckedChange={(enabled) => change.mutate({ save: { ...rule, enabled } })}
                  />
                  {canEdit && (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={m.RULE_EDIT({ name: rule.name })}
                        onClick={() => setEditing(rule)}
                      >
                        <PencilIcon />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={m.RULE_DELETE({ name: rule.name })}
                        onClick={() => setDeleting(rule)}
                      >
                        <TrashIcon />
                      </Button>
                    </>
                  )}
                </div>
              </Panel>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">{m.RULE_HINT()}</p>
      {editing && <RuleEditor rule={editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <ConfirmDialog
          title={m.RULE_DELETE({ name: deleting.name })}
          confirmLabel={m.DELETE()}
          destructive
          onConfirm={() => {
            change.mutate({ delete: deleting.id });
            setDeleting(null);
          }}
          onCancel={() => setDeleting(null)}
        >
          {m.RULE_DELETE_CONFIRM()}
        </ConfirmDialog>
      )}
    </>
  );
};
