import { useState } from 'react';
import PlayIcon from '~icons/lucide/play';
import { useWebSocketActions, useWebSocketContext } from '../../hooks/useWebsocket';
import { ConfirmDialog, DialogButton } from '../../components/ConfirmDialog';
import { m } from '../../paraglide/messages';

type Result = { output: string } | { syntaxError: string } | { failed: string };

// Runs a script once to try it, as the WebUI's script editor does: the
// syntax check first, then the script itself (webui.js HMScriptExecutor,
// editScript.htm). For elevated administrators: a script can change
// anything on the CCU.
export const useScriptTest = () => {
  const { request } = useWebSocketActions();
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (script: string) => {
    setBusy(true);
    setResult(null);
    try {
      const response = await request({ type: 'runScript', script }, { queue: false, timeoutMs: 60000 });
      setResult(response.syntaxError ? { syntaxError: response.syntaxError } : { output: response.output });
    } catch (error) {
      setResult({ failed: (error as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return { run, result, busy };
};

export const ScriptResult = ({ result }: { result: Result | null }) => {
  if (!result) return null;
  if ('syntaxError' in result || 'failed' in result) {
    return (
      <pre role="alert" className="max-h-60 overflow-auto rounded-md bg-destructive/10 p-2 font-mono text-xs whitespace-pre-wrap text-destructive">
        {'syntaxError' in result ? `${m.SCRIPT_SYNTAX_ERROR()}: ${result.syntaxError}` : `${m.CHANGE_FAILED()}: ${result.failed}`}
      </pre>
    );
  }
  return (
    <pre
      aria-label={m.SCRIPT_OUTPUT()}
      className="max-h-60 overflow-auto rounded-md bg-muted/60 p-2 font-mono text-xs whitespace-pre-wrap text-foreground"
    >
      {result.output || m.SCRIPT_NO_OUTPUT()}
    </pre>
  );
};

// The button below a script action of the program editor
export const ScriptTestButton = ({ script }: { script: string }) => {
  const { userLevel, elevated } = useWebSocketContext();
  const { run, result, busy } = useScriptTest();
  if (userLevel !== 'admin') return null;
  return (
    <div className="flex w-full flex-col gap-2">
      <div>
        <DialogButton type="button" className="h-8" disabled={!elevated || busy || script.trim() === ''} onClick={() => run(script)}>
          <PlayIcon />
          {m.SCRIPT_TEST()}
        </DialogButton>
      </div>
      <ScriptResult result={result} />
    </div>
  );
};

// A free script, as the WebUI's "Skript testen" dialog on the programs page
export const ScriptTestDialog = ({ onDone }: { onDone: () => void }) => {
  const [script, setScript] = useState('');
  const { run, result, busy } = useScriptTest();
  return (
    <ConfirmDialog
      title={m.SCRIPT_TEST()}
      confirmLabel={m.SCRIPT_RUN()}
      busy={busy || script.trim() === ''}
      onConfirm={() => run(script)}
      onCancel={onDone}
    >
      <div className="flex flex-col gap-3">
        <textarea
          aria-label={m.PRG_KIND_SCRIPT()}
          className="min-h-48 w-full rounded-md border bg-transparent p-2 font-mono text-[13px] text-foreground"
          spellCheck={false}
          autoFocus
          placeholder={'WriteLine("Hallo");'}
          value={script}
          onChange={(e) => setScript(e.target.value)}
        />
        <ScriptResult result={result} />
        <p className="text-xs text-muted-foreground">{m.SCRIPT_HINT()}</p>
      </div>
    </ConfirmDialog>
  );
};
