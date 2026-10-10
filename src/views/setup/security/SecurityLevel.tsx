import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWebSocketActions } from '../../../hooks/useWebsocket';
import { Button } from '../../../components/ui/button';
import { useToast } from '../../../contexts/ToastContext';
import { usePasswordRetry } from '../usePasswordRetry';
import { m } from '../../../paraglide/messages';
import { errorText } from '../../../lib/errors';

type Level = 'HIGH' | 'MEDIUM' | 'LOW';

// The levels of the WebUI's security wizard (DialogChooseSecuritySettings,
// texts from translate.lang.extension.js secLevel*)
const LEVELS: { id: Level; title: () => string; caption: () => string }[] = [
  {
    id: 'HIGH',
    title: () => m.SEC_LEVEL_HIGH(),
    caption: () => m.SEC_LEVEL_HIGH_HINT(),
  },
  {
    id: 'MEDIUM',
    title: () => m.SEC_LEVEL_MEDIUM(),
    caption: () => m.SEC_LEVEL_MEDIUM_HINT(),
  },
  {
    id: 'LOW',
    title: () => m.SEC_LEVEL_LOW(),
    caption: () => m.SEC_LEVEL_LOW_HINT(),
  },
];

// Firewall and authentication set together by one level
// (CCU.setSecurityLevel); a change in the firewall afterwards makes the
// level "custom"
export const SecurityLevel = ({ current, disabled }: { current: string; disabled: boolean }) => {
  const { request } = useWebSocketActions();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Level | null>(null);
  const [busy, setBusy] = useState(false);
  const password = usePasswordRetry();
  const choice = selected ?? (current === 'CUSTOM' ? null : (current as Level));
  const apply = (level: Level) =>
    password.run(
      async (pw) => {
        setBusy(true);
        try {
          await request(
            {
              type: 'setSecurityLevel',
              level,
              ...(pw !== undefined ? { password: pw } : {}),
            },
            { queue: false, timeoutMs: 60000 },
          );
          showToast(m.SEC_LEVEL_SAVED(), 'info');
          setSelected(null);
          await Promise.all(['security', 'firewall'].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
        } finally {
          setBusy(false);
        }
      },
      (error) => showToast(errorText(error, m.CHANGE_FAILED)),
    );
  return (
    <div className="flex flex-col gap-2">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        {m.SEC_LEVEL()}
        {current === 'CUSTOM' && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal">{m.SEC_LEVEL_CUSTOM()}</span>
        )}
      </h3>
      <div role="radiogroup" aria-label={m.SEC_LEVEL()} className="grid gap-2 sm:grid-cols-3">
        {LEVELS.map((level) => (
          // biome-ignore lint/a11y/useSemanticElements: a segmented switch: buttons with role radio and aria-checked; native radios would change its look
          <button
            key={level.id}
            type="button"
            role="radio"
            aria-checked={choice === level.id}
            disabled={disabled || busy}
            onClick={() => setSelected(level.id)}
            className={`flex flex-col gap-1 rounded-lg border p-3 text-left text-sm transition-colors disabled:opacity-60 ${choice === level.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/50'}`}
          >
            <span className="font-medium">
              {level.title()}
              {current === level.id && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">({m.SEC_LEVEL_ACTIVE()})</span>
              )}
            </span>
            <span className="text-xs text-muted-foreground">{level.caption()}</span>
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{m.SEC_LEVEL_HINT()}</p>
      {selected && selected !== current && (
        <>
          {password.field}
          <div className="flex justify-end">
            <Button type="button" disabled={disabled || busy || password.blocked} onClick={() => apply(selected)}>
              {m.SEC_LEVEL_APPLY()}
            </Button>
          </div>
        </>
      )}
    </div>
  );
};
