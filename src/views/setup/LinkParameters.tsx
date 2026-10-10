import { type ReactNode, useState } from 'react';
import { useLinkAction, useLinkParamset } from '../../queries';
import { useToast } from '../../contexts/ToastContext';
import { type TranslationKey, useTranslations } from '../../i18n/utils';
import type { DatapointValue, Link, ParamsetDescription } from '../../types/types';
import { ConfirmDialog, DialogButton } from '../../components/ConfirmDialog';
import {
  formatParameterValue,
  ParameterValue,
  ParamsetView,
  shownParameters,
} from '../../controls/generic/ParamsetView';
import {
  BIDCOS_PERMANENT,
  decodeHmipTime,
  detectProfile,
  encodeHmipTime,
  type LinkProfile,
  linkParameterNames,
  PERMANENT,
  type ProfileField,
  profileValues,
  TIME_BASES,
} from '../../controls/links/linkProfiles';
import { TimeInput } from '../../controls/links/TimeInput';
import { getLocale } from '../../paraglide/runtime';
import { PanelSkeleton } from '../../components/ui/skeleton';
import { m } from '../../paraglide/messages';
import { NativeSelect } from '../../components/ui/select';

import { useLinkProfiles } from './useLinkProfiles';

// One adjustable setting of a profile: a time or a value, for all the
// parameters it names
const ProfileFieldRow = ({
  field,
  description,
  values,
  onSet,
}: {
  field: ProfileField;
  description: ParamsetDescription;
  values: Record<string, DatapointValue>;
  onSet: (values: Record<string, DatapointValue>) => void;
}) => {
  const lang = getLocale();
  const label = field.label[lang] || field.label.de || field.params[0];
  const [first] = field.params;
  if (field.kind === 'time') {
    // HmIP: <NAME>_BASE and <NAME>_FACTOR
    const baseName = `${first}_BASE`;
    const factorName = `${first}_FACTOR`;
    if (!(baseName in description) || !(factorName in description)) return null;
    const seconds = decodeHmipTime(Number(values[baseName] ?? 0), Number(values[factorName] ?? 0));
    return (
      <FieldRow label={label}>
        <TimeInput
          label={label}
          seconds={seconds}
          max={TIME_BASES[7] * 31}
          onChange={(next) => {
            const { base, factor } = encodeHmipTime(next);
            onSet({ [baseName]: base, [factorName]: factor });
          }}
        />
      </FieldRow>
    );
  }
  const parameter = description[first];
  if (!parameter) return null;
  const setAll = (value: DatapointValue) =>
    onSet(Object.fromEntries(field.params.filter((name) => name in description).map((name) => [name, value])));
  // BidCos times: seconds, 111600 and more is permanent
  if (parameter.type === 'FLOAT' && /_TIME$/.test(first)) {
    const raw = Number(values[first] ?? 0);
    return (
      <FieldRow label={label}>
        <TimeInput
          label={label}
          seconds={raw >= BIDCOS_PERMANENT ? PERMANENT : raw}
          max={BIDCOS_PERMANENT - 1}
          onChange={(next) => setAll(next === PERMANENT ? BIDCOS_PERMANENT : next)}
        />
      </FieldRow>
    );
  }
  // Choices the WebUI names (e.g. the kind of heating), by value
  if (field.options) {
    const current = Number(values[first] ?? 0);
    const choices = Object.entries(field.options).sort(([a], [b]) => Number(a) - Number(b));
    return (
      <FieldRow label={label}>
        <NativeSelect
          className="w-auto max-w-xs"
          aria-label={label}
          value={current}
          onChange={(event) => {
            const next = Number(event.target.value);
            setAll(parameter.type === 'BOOL' ? next === 1 : next);
          }}
        >
          {!choices.some(([value]) => Number(value) === current) && <option value={current}>{current}</option>}
          {choices.map(([value, text]) => (
            <option key={value} value={value}>
              {text[lang] || text.de}
            </option>
          ))}
        </NativeSelect>
      </FieldRow>
    );
  }
  return (
    <FieldRow label={label}>
      <ParameterValue
        name={first}
        label={label}
        parameter={parameter}
        value={values[first]}
        onSet={(_, value) => setAll(value)}
      />
    </FieldRow>
  );
};

const FieldRow = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex min-h-10 flex-wrap items-center justify-between gap-x-4 gap-y-1 py-1 text-sm">
    <span className="min-w-0 flex-1 basis-48">{label}</span>
    {children}
  </div>
);

const changedFrom = (current: Record<string, DatapointValue>, next: Record<string, DatapointValue>) =>
  Object.fromEntries(Object.entries(next).filter(([name, value]) => current[name] !== value));

// The profile of a link, the WebUI's or expert (0), and what it does
const ProfilePicker = ({
  profiles,
  profileId,
  onChoose,
}: {
  profiles: LinkProfile[];
  profileId: number;
  onChoose: (id: number) => void;
}) => {
  const lang = getLocale();
  const profile = profiles.find((p) => p.id === profileId);
  return (
    <>
      <label className="flex flex-wrap items-center gap-2 text-sm font-medium">
        {m.LINK_PROFILE()}
        <NativeSelect className="max-w-xs" value={profileId} onChange={(event) => onChoose(Number(event.target.value))}>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name[lang] || p.name.de}
            </option>
          ))}
          <option value={0}>{m.LINK_PROFILE_EXPERT()}</option>
        </NativeSelect>
      </label>
      {profile && (profile.description[lang] || profile.description.de) && (
        <p className="text-sm text-muted-foreground">{profile.description[lang] || profile.description.de}</p>
      )}
    </>
  );
};

// The few settings of a profile, short and long press apart
const ProfileFields = ({
  fields,
  description,
  values,
  onSet,
}: {
  fields: ProfileField[];
  description: ParamsetDescription;
  values: Record<string, DatapointValue>;
  onSet: (values: Record<string, DatapointValue>) => void;
}) => {
  if (fields.length === 0) return null;
  const longFields = fields.filter((f) => f.params[0].startsWith('LONG_'));
  const shortFields = fields.filter((f) => !f.params[0].startsWith('LONG_'));
  const fieldList = (list: ProfileField[]) =>
    list.map((field) => (
      <ProfileFieldRow
        key={field.params.join()}
        field={field}
        description={description}
        values={values}
        onSet={onSet}
      />
    ));
  return (
    <div className="flex flex-col divide-y rounded-lg border px-3">
      {longFields.length > 0 && shortFields.length > 0 && (
        <span className="pt-2 text-xs font-medium text-muted-foreground uppercase">{m.LINK_SHORT_PRESS()}</span>
      )}
      {fieldList(shortFields)}
      {longFields.length > 0 && (
        <span className="pt-2 text-xs font-medium text-muted-foreground uppercase">{m.LINK_LONG_PRESS()}</span>
      )}
      {fieldList(longFields)}
    </div>
  );
};

// What saving changes: another profile, or each parameter with its old
// and new value
const LinkChangesSummary = ({
  profileChange,
  changes,
  description,
  current,
}: {
  profileChange: { from: string; to: string } | null;
  changes: [string, DatapointValue][];
  description: ParamsetDescription;
  current: Record<string, DatapointValue>;
}) => {
  const t = useTranslations();
  return profileChange ? (
    <>
      <p>{m.LINK_PROFILE_CHANGE(profileChange)}</p>
      <p className="text-muted-foreground">{m.LINK_PARAMS_CHANGED({ count: changes.length })}</p>
    </>
  ) : (
    <ul className="flex list-disc flex-col gap-1 pl-5">
      {changes.map(([name, value]) => (
        <li key={name}>
          <strong>{t(name as TranslationKey)}</strong>: {formatParameterValue(description[name], current[name])} →{' '}
          {formatParameterValue(description[name], value)}
        </li>
      ))}
    </ul>
  );
};

// The parameters of one link on the receiver's side: a profile of the
// WebUI with its few settings, or every parameter (expert). Changes are
// collected, confirmed and saved together.
export const LinkParameters = ({ interfaceName, link }: { interfaceName: string; link: Link }) => {
  const t = useTranslations();
  const lang = getLocale();
  const { showToast } = useToast();
  const { description, values } = useLinkParamset(interfaceName, link.receiver, link.sender);
  const action = useLinkAction();
  const [draft, setDraft] = useState<Record<string, DatapointValue>>({});
  const [chosen, setChosen] = useState<number>();
  const [confirming, setConfirming] = useState(false);
  const loadedProfiles = useLinkProfiles(interfaceName, link);

  // A failed request is said, not swallowed: the button would seem to do nothing
  const failed = description.error ?? values.error;
  if (failed) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {m.LINK_PARAMS_FAILED()}: {failed.message}
      </p>
    );
  }
  if (!description.data || !values.data) {
    return <PanelSkeleton lines={3} />;
  }
  const current = values.data;
  const merged = { ...current, ...draft };
  const profiles = loadedProfiles ?? [];
  const saved = detectProfile(profiles, current);
  const profileId = chosen ?? saved;
  const profile = profiles.find((p) => p.id === profileId);
  const changes = Object.entries(draft);
  const nameOf = (id: number) => {
    const p = profiles.find((candidate) => candidate.id === id);
    return p ? p.name[lang] || p.name.de : m.LINK_PROFILE_EXPERT();
  };

  const choose = (id: number) => {
    setChosen(id);
    const next = profiles.find((p) => p.id === id);
    // Expert keeps the values; a profile writes its own, keeping the
    // adjustable ones when it is the saved profile
    setDraft(next ? changedFrom(current, profileValues(next, description.data, current, id === saved)) : {});
  };
  const setValues = (next: Record<string, DatapointValue>) =>
    setDraft((prev) => {
      const out = { ...prev, ...next };
      for (const [name, value] of Object.entries(next)) if (current[name] === value) delete out[name];
      return out;
    });

  const readable = linkParameterNames(profiles, lang, (key) => t(key as TranslationKey), m.LINK_LONG());

  return (
    <>
      {profiles.length > 0 ? (
        <div className="flex flex-col gap-2">
          <ProfilePicker profiles={profiles} profileId={profileId} onChoose={choose} />
          <ProfileFields
            fields={profile?.fields ?? []}
            description={description.data}
            values={merged}
            onSet={setValues}
          />
        </div>
      ) : (
        loadedProfiles && <p className="text-xs text-muted-foreground">{m.LINK_NO_PROFILES()}</p>
      )}
      {shownParameters(description.data).length > 0 && (
        <details open={profiles.length === 0 || profileId === 0} className="group">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
            {m.LINK_ALL_PARAMETERS()}
          </summary>
          <div className="mt-2">
            <ParamsetView
              label={`${m.LINK_PARAMETERS()} ${link.sender} ${link.receiver}`}
              description={description.data}
              values={merged}
              changed={new Set(Object.keys(draft))}
              onSet={(name, value) => setValues({ [name]: value })}
              nameOf={readable.nameOf}
              optionOf={readable.optionOf}
            />
          </div>
        </details>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <DialogButton type="button" primary disabled={changes.length === 0} onClick={() => setConfirming(true)}>
          {m.SAVE()} {changes.length > 0 ? `(${changes.length})` : ''}
        </DialogButton>
      </div>
      {confirming && (
        <ConfirmDialog
          title={m.SAVE_CHANGES()}
          confirmLabel={m.SAVE()}
          busy={action.isPending}
          onCancel={() => setConfirming(false)}
          onConfirm={() =>
            action.mutate(
              { type: 'putLinkParamset', interfaceName, address: link.receiver, partner: link.sender, values: draft },
              {
                onSuccess: () => {
                  setDraft({});
                  setChosen(undefined);
                  showToast(m.SAVED(), 'info');
                },
                onError: (error) => showToast(`${m.SAVE_FAILED()}: ${error.message}`),
                onSettled: () => setConfirming(false),
              },
            )
          }
        >
          <LinkChangesSummary
            profileChange={
              profiles.length > 0 && profileId !== saved ? { from: nameOf(saved), to: nameOf(profileId) } : null
            }
            changes={changes}
            description={description.data}
            current={current}
          />
        </ConfirmDialog>
      )}
    </>
  );
};
