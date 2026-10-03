import { ReactNode, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import PlusIcon from '~icons/lucide/plus';
import CopyIcon from '~icons/lucide/copy';
import TrashIcon from '~icons/lucide/trash-2';
import { useProgram, useProgramChange } from '../../queries';
import { useWebSocketContext } from '../../hooks/useWebsocket';
import { useToast } from '../../contexts/ToastContext';
import { usePageTitle } from '../../contexts/PageTitleContext';
import { ProgramBranch, ProgramDefinition, ProgramRule } from '../../types/protocol';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Switch } from '../../components/ui/switch';
import { NativeSelect } from '../../components/ui/select';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { m } from '../../paraglide/messages';
import { ConditionRow, DestinationRow } from './ProgramRows';
import { newBranch, newCondition, newDestination, newProgram, newRule, programProblems } from './programModel';

// The program editor: WENN / SONST WENN / SONST with their conditions and
// actions, like the WebUI's (rega/esp/programs.htm). Saved as a whole.

const Card = ({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) => (
  <section aria-label={title} className="tile-edge flex flex-col gap-3 rounded-2xl border bg-card/60 p-4">
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-[17px] font-semibold">{title}</h2>
      {action}
    </div>
    {children}
  </section>
);

const Joiner = ({ children }: { children: ReactNode }) => (
  <div className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
    <span className="h-px flex-1 bg-border" />
    {children}
    <span className="h-px flex-1 bg-border" />
  </div>
);

const AddButton = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <Button type="button" variant="outline" size="sm" onClick={onClick}>
    <PlusIcon />
    {label}
  </Button>
);

// The actions of a rule (DANN) or of SONST
const BranchEditor = ({ branch, onChange }: { branch: ProgramBranch; onChange: (b: ProgramBranch) => void }) => (
  <div className="flex flex-col gap-2">
    {branch.destinations.map((destination, i) => (
      <DestinationRow
        key={i}
        destination={destination}
        onChange={(d) => onChange({ ...branch, destinations: branch.destinations.map((x, j) => (j === i ? d : x)) })}
        onRemove={() => onChange({ ...branch, destinations: branch.destinations.filter((_, j) => j !== i) })}
      />
    ))}
    <div className="flex flex-wrap items-center justify-between gap-2">
      <AddButton
        label={m.ADD_ACTION()}
        onClick={() => onChange({ ...branch, destinations: [...branch.destinations, newDestination('device')] })}
      />
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={branch.breakOnRestart}
          onChange={(e) => onChange({ ...branch, breakOnRestart: e.target.checked })}
        />
        {m.BREAK_ON_RESTART()}
      </label>
    </div>
  </div>
);

const RuleEditor = ({
  rule,
  first,
  onChange,
  onRemove,
}: {
  rule: ProgramRule;
  first: boolean;
  onChange: (r: ProgramRule) => void;
  onRemove?: () => void;
}) => {
  const inner = rule.groupOperator === 'and' ? m.OP_OR() : m.OP_AND();
  const outer = rule.groupOperator === 'and' ? m.OP_AND() : m.OP_OR();
  const setGroup = (g: number, group: ProgramRule['groups'][number]) =>
    onChange({ ...rule, groups: rule.groups.map((x, i) => (i === g ? group : x)).filter((x) => x.length > 0) });
  const title = first ? m.RULE_IF() : m.RULE_ELSE_IF();
  return (
    <Card
      title={title}
      action={
        onRemove && (
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            <TrashIcon />
            {m.REMOVE_RULE()}
          </Button>
        )
      }
    >
      {rule.groups.map((group, g) => (
        <div key={g} className="flex flex-col gap-2">
          {g > 0 && <Joiner>{outer}</Joiner>}
          <div className="flex flex-col gap-2 rounded-xl border border-dashed p-2">
            {group.map((condition, c) => (
              <div key={c} className="flex flex-col gap-2">
                {c > 0 && <Joiner>{inner}</Joiner>}
                <ConditionRow
                  condition={condition}
                  onChange={(next) => setGroup(g, group.map((x, i) => (i === c ? next : x)))}
                  onRemove={() => setGroup(g, group.filter((_, i) => i !== c))}
                />
              </div>
            ))}
            <div>
              <AddButton label={`${m.ADD_CONDITION()} (${inner})`} onClick={() => setGroup(g, [...group, newCondition('device')])} />
            </div>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <AddButton
          label={`${m.ADD_GROUP()} (${outer})`}
          onClick={() => onChange({ ...rule, groups: [...rule.groups, [newCondition('device')]] })}
        />
        {rule.groups.length > 1 && (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            {m.GROUPS_JOINED()}
            <NativeSelect
              className="h-8 w-auto md:text-[13px]"
              aria-label={m.GROUPS_JOINED()}
              value={rule.groupOperator}
              onChange={(e) => onChange({ ...rule, groupOperator: e.target.value as 'or' | 'and' })}
            >
              <option value="or">{m.OP_OR()}</option>
              <option value="and">{m.OP_AND()}</option>
            </NativeSelect>
          </label>
        )}
      </div>
      <h3 className="pt-2 text-[15px] font-semibold">{m.RULE_THEN()}</h3>
      <BranchEditor branch={rule} onChange={(branch) => onChange({ ...rule, ...branch })} />
    </Card>
  );
};

export const ProgramEditor = () => {
  const { programId } = useParams({ from: '/program/$programId' });
  const isNew = programId === 'new';
  const id = isNew ? 0 : Number(programId);
  const { data: loaded, isError } = useProgram(id, { enabled: !isNew });
  const { userLevel, elevated } = useWebSocketContext();
  const canEdit = userLevel === 'admin' && elevated;
  const change = useProgramChange();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<ProgramDefinition | undefined>(isNew ? newProgram() : undefined);
  const [confirm, setConfirm] = useState<'save' | 'delete' | null>(null);
  usePageTitle(isNew ? m.NEW_PROGRAM() : draft?.name || m.EDIT_PROGRAM());

  useEffect(() => {
    if (loaded) setDraft(loaded);
  }, [loaded]);

  if (isError) {
    return <p className="text-sm text-muted-foreground">{m.EMPTY_LIST()}</p>;
  }
  if (!draft) {
    return null;
  }
  const problems = programProblems(draft);
  const setRule = (i: number, rule: ProgramRule) => setDraft({ ...draft, rules: draft.rules.map((r, j) => (j === i ? rule : r)) });

  const save = () =>
    change.mutate(
      { type: 'saveProgram', program: draft },
      {
        onSuccess: (response) => {
          setConfirm(null);
          showToast(m.SAVED(), 'info');
          const savedId = 'id' in response ? response.id : undefined;
          if (isNew && savedId) navigate({ to: '/program/$programId', params: { programId: String(savedId) }, replace: true });
        },
        onError: (error) => {
          setConfirm(null);
          showToast(`${m.SAVE_FAILED()}: ${error.message}`);
        },
      },
    );

  // "Als neues Programm speichern", as the WebUI's program editor
  // (isePrograms.CopyToNewProgram): the draft becomes a new program
  const saveAsNew = () =>
    change.mutate(
      { type: 'saveProgram', program: { ...draft, id: 0, name: m.PRG_COPY_NAME({ name: draft.name }).slice(0, 100) } },
      {
        onSuccess: (response) => {
          showToast(m.PRG_COPIED(), 'info');
          const savedId = 'id' in response ? response.id : undefined;
          if (savedId) navigate({ to: '/program/$programId', params: { programId: String(savedId) } });
        },
        onError: (error) => showToast(`${m.SAVE_FAILED()}: ${error.message}`),
      },
    );

  return (
    <fieldset disabled={!canEdit} className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-60 flex-1 flex-col gap-1 text-xs">
          <span className="text-muted-foreground">{m.PROGRAM_NAME()}</span>
          <Input
            aria-label={m.PROGRAM_NAME()}
            value={draft.name}
            maxLength={100}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </label>
        <label className="flex h-9 items-center gap-2 text-sm">
          <Switch aria-label={m.ACTIVE()} checked={draft.active} onCheckedChange={(active) => setDraft({ ...draft, active })} />
          {m.ACTIVE()}
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-muted-foreground">{m.PROGRAM_DESCRIPTION()}</span>
        <textarea
          aria-label={m.PROGRAM_DESCRIPTION()}
          className="min-h-14 rounded-md border bg-transparent p-2 text-sm text-foreground"
          value={draft.description}
          maxLength={1000}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        />
      </label>
      <p className="text-xs text-muted-foreground">{m.PROGRAM_HINT()}</p>

      {draft.rules.map((rule, i) => (
        <RuleEditor
          key={i}
          rule={rule}
          first={i === 0}
          onChange={(r) => setRule(i, r)}
          onRemove={i > 0 ? () => setDraft({ ...draft, rules: draft.rules.filter((_, j) => j !== i) }) : undefined}
        />
      ))}
      {draft.else ? (
        <Card
          title={m.RULE_ELSE()}
          action={
            <Button type="button" variant="ghost" size="sm" onClick={() => setDraft({ ...draft, else: undefined })}>
              <TrashIcon />
              {m.REMOVE_RULE()}
            </Button>
          }
        >
          <BranchEditor branch={draft.else} onChange={(b) => setDraft({ ...draft, else: b })} />
        </Card>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <AddButton label={m.ADD_ELSE_IF()} onClick={() => setDraft({ ...draft, rules: [...draft.rules, newRule()] })} />
        {!draft.else && (
          <AddButton
            label={m.ADD_ELSE()}
            onClick={() => setDraft({ ...draft, else: { ...newBranch(), destinations: [newDestination('device')] } })}
          />
        )}
      </div>

      {canEdit && (
        <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-end gap-2 rounded-xl border bg-background/85 p-3 shadow-lg backdrop-blur-md">
          {problems.length > 0 && <span className="mr-auto text-sm text-destructive">{m.PROGRAM_INVALID()}</span>}
          {!isNew && (
            <Button type="button" variant="ghost" onClick={() => setConfirm('delete')}>
              <TrashIcon />
              {m.DELETE()}
            </Button>
          )}
          <Button type="button" variant="outline" asChild>
            <Link to="/programs">{m.CANCEL()}</Link>
          </Button>
          {!isNew && (
            <Button type="button" variant="outline" disabled={problems.length > 0 || change.isPending} onClick={saveAsNew}>
              <CopyIcon />
              {m.PRG_SAVE_AS_NEW()}
            </Button>
          )}
          <Button type="button" disabled={problems.length > 0 || change.isPending} onClick={() => setConfirm('save')}>
            {m.SAVE()}
          </Button>
        </div>
      )}
      {confirm === 'save' && (
        <ConfirmDialog
          title={m.SAVE_CHANGES()}
          confirmLabel={m.SAVE()}
          busy={change.isPending}
          onCancel={() => setConfirm(null)}
          onConfirm={save}
        >
          {m.PROGRAM_SAVE_CONFIRM({ name: draft.name })}
        </ConfirmDialog>
      )}
      {confirm === 'delete' && (
        <ConfirmDialog
          title={m.DELETE_NAMED({ name: draft.name })}
          confirmLabel={m.DELETE()}
          destructive
          busy={change.isPending}
          onCancel={() => setConfirm(null)}
          onConfirm={() =>
            change.mutate(
              { type: 'deleteProgram', id },
              {
                onSuccess: () => {
                  showToast(m.DELETED_OBJECT(), 'info');
                  navigate({ to: '/programs' });
                },
                onError: (error) => {
                  setConfirm(null);
                  showToast(`${m.CHANGE_FAILED()}: ${error.message}`);
                },
              },
            )
          }
        >
          {m.DELETE_PROGRAM_CONFIRM()}
        </ConfirmDialog>
      )}
    </fieldset>
  );
};
