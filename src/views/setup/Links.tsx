import { ReactNode, useEffect, useMemo, useState } from 'react';
import { useDevices, useLinkAction, useLinkParamset, useLinks } from '../../queries';
import { useToast } from '../../contexts/ToastContext';
import { TranslationKey, useTranslations } from '../../i18n/utils';
import { DatapointValue, DeviceChannel, Link, ParamsetDescription } from '../../types/types';
import { ConfirmDialog, DialogButton } from '../../components/ConfirmDialog';
import { formatParameterValue, ParameterValue, ParamsetView, shownParameters } from '../../controls/generic/ParamsetView';
import {
  BIDCOS_PERMANENT,
  decodeHmipTime,
  detectProfile,
  encodeHmipTime,
  loadProfileTable,
  PERMANENT,
  ProfileField,
  profilesFor,
  ProfileTable,
  profileValues,
  TIME_BASES,
} from '../../controls/links/linkProfiles';
import { TimeInput } from '../../controls/links/TimeInput';
import { getLocale } from '../../paraglide/runtime';
import { useChannelNames } from './channelNames';
import { PanelSkeleton } from '../../components/ui/skeleton';
import { m } from '../../paraglide/messages';
import { NativeSelect } from '../../components/ui/select';
import { Input } from '../../components/ui/input';

const Row = ({ children }: { children: ReactNode }) => <div className="flex flex-wrap items-center gap-2">{children}</div>;

const shareRole = (a: string[] = [], b: string[] = []) => a.some((role) => b.includes(role));

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
  return (
    <FieldRow label={label}>
      <ParameterValue name={first} label={label} parameter={parameter} value={values[first]} onSet={(_, value) => setAll(value)} />
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

// The parameters of one link on the receiver's side: a profile of the
// WebUI with its few settings, or every parameter (expert). Changes are
// collected, confirmed and saved together.
export const LinkParameters = ({ interfaceName, link, receiverType, senderType, senderDeviceType }: {
  interfaceName: string;
  link: Link;
  receiverType?: string;
  senderType?: string;
  senderDeviceType?: string;
}) => {
  const t = useTranslations();
  const lang = getLocale();
  const { showToast } = useToast();
  const { description, values } = useLinkParamset(interfaceName, link.receiver, link.sender);
  const action = useLinkAction();
  const [table, setTable] = useState<ProfileTable>();
  const [draft, setDraft] = useState<Record<string, DatapointValue>>({});
  const [chosen, setChosen] = useState<number>();
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let active = true;
    loadProfileTable().then((loaded) => active && setTable(loaded));
    return () => {
      active = false;
    };
  }, []);

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
  const profiles = table && receiverType && senderType ? profilesFor(table, receiverType, senderType, senderDeviceType) : [];
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

  const shownFields = profile?.fields ?? [];
  const longFields = shownFields.filter((f) => f.params[0].startsWith('LONG_'));
  const shortFields = shownFields.filter((f) => !f.params[0].startsWith('LONG_'));
  const fieldList = (fields: ProfileField[]) =>
    fields.map((field) => (
      <ProfileFieldRow key={field.params.join()} field={field} description={description.data} values={merged} onSet={setValues} />
    ));

  return (
    <>
      {profiles.length > 0 ? (
        <div className="flex flex-col gap-2">
          <label className="flex flex-wrap items-center gap-2 text-sm font-medium">
            {m.LINK_PROFILE()}
            <NativeSelect className="max-w-xs" value={profileId} onChange={(event) => choose(Number(event.target.value))}>
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
          {shownFields.length > 0 && (
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
          )}
        </div>
      ) : (
        table && <p className="text-xs text-muted-foreground">{m.LINK_NO_PROFILES()}</p>
      )}
      {shownParameters(description.data).length > 0 && (
        <details open={profiles.length === 0 || profileId === 0} className="group">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground">{m.LINK_ALL_PARAMETERS()}</summary>
          <div className="mt-2">
            <ParamsetView
              label={`${m.LINK_PARAMETERS()} ${link.sender} ${link.receiver}`}
              description={description.data}
              values={merged}
              changed={new Set(Object.keys(draft))}
              onSet={(name, value) => setValues({ [name]: value })}
            />
          </div>
        </details>
      )}
      <Row>
        <DialogButton type="button" primary disabled={changes.length === 0} onClick={() => setConfirming(true)}>
          {m.SAVE()} {changes.length > 0 ? `(${changes.length})` : ''}
        </DialogButton>
      </Row>
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
          {profiles.length > 0 && profileId !== saved ? (
            <>
              <p>{m.LINK_PROFILE_CHANGE({ from: nameOf(saved), to: nameOf(profileId) })}</p>
              <p className="text-muted-foreground">{m.LINK_PARAMS_CHANGED({ count: changes.length })}</p>
            </>
          ) : (
            <ul className="flex list-disc flex-col gap-1 pl-5">
              {changes.map(([name, value]) => (
                <li key={name}>
                  <strong>{t(name as TranslationKey)}</strong>:{' '}
                  {formatParameterValue(description.data[name], current[name], t)} →{' '}
                  {formatParameterValue(description.data[name], value, t)}
                </li>
              ))}
            </ul>
          )}
        </ConfirmDialog>
      )}
    </>
  );
};

interface LinksProps {
  interfaceName: string;
  deviceAddress: string;
  channels: DeviceChannel[];
}

// Channel and device type by channel address, to find the link profiles
export const useLinkChannelInfo = () => {
  const { data: devices = [] } = useDevices();
  return useMemo(
    () =>
      new Map(
        devices.flatMap((d) => (d.channels ?? []).map((channel) => [channel.address, { channel, deviceType: d.type }] as const)),
      ),
    [devices],
  );
};

// Linking a channel of a device with a fitting channel of another one
export const AddLinkForm = ({ interfaceName, deviceAddress, channels }: LinksProps) => {
  const { showToast } = useToast();
  const { data: devices = [] } = useDevices();
  const names = useChannelNames();
  const action = useLinkAction();
  const label = (address: string) => `${names.get(address) ?? address} (${address})`;
  const linkable = channels.filter((c) => c.linkSourceRoles?.length || c.linkTargetRoles?.length);
  const [own, setOwn] = useState('');
  const [partner, setPartner] = useState('');
  const [linkName, setLinkName] = useState('');
  const ownChannel = linkable.find((c) => c.address === own);

  // Channels of other devices on the same interface that fit the chosen one
  const partners = useMemo(() => {
    if (!ownChannel) return [];
    return devices
      .filter((d) => d.interfaceName === interfaceName && d.address !== deviceAddress)
      .flatMap((d) => d.channels ?? [])
      .filter(
        (c) =>
          shareRole(ownChannel.linkSourceRoles, c.linkTargetRoles) ||
          shareRole(ownChannel.linkTargetRoles, c.linkSourceRoles),
      );
  }, [devices, interfaceName, deviceAddress, ownChannel]);


  const add = () => {
    const partnerChannel = partners.find((c) => c.address === partner);
    if (!ownChannel || !partnerChannel) return;
    // The side with matching source roles sends
    const ownSends = shareRole(ownChannel.linkSourceRoles, partnerChannel.linkTargetRoles);
    action.mutate(
      {
        type: 'addLink',
        interfaceName,
        sender: ownSends ? own : partner,
        receiver: ownSends ? partner : own,
        name: linkName,
      },
      {
        onSuccess: () => {
          showToast(m.LINK_ADDED(), 'info');
          setPartner('');
          setLinkName('');
        },
        onError: (error) => showToast(`${m.CHANGE_FAILED()}: ${error.message}`),
      },
    );
  };

  return (
    <>
      {linkable.length > 0 && (
        <form
          className="mt-2 grid max-w-[460px] gap-3 [&_label]:grid [&_label]:gap-1.5 [&_label]:text-sm [&_label]:text-muted-foreground"
          aria-label={m.ADD_LINK()}
          onSubmit={(event) => {
            event.preventDefault();
            add();
          }}
        >
          <strong className="text-sm">{m.ADD_LINK()}</strong>
          <label>
            {m.LINK_OWN_CHANNEL()}
            <NativeSelect
              value={own}
              onChange={(e) => {
                setOwn(e.target.value);
                setPartner('');
              }}
            >
              <option value="" />
              {linkable.map((c) => (
                <option key={c.address} value={c.address}>
                  {label(c.address)}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label>
            {m.LINK_PARTNER()}
            <NativeSelect value={partner} disabled={!ownChannel} onChange={(e) => setPartner(e.target.value)}>
              <option value="" />
              {partners.map((c) => (
                <option key={c.address} value={c.address}>
                  {label(c.address)}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label>
            {m.LINK_NAME()}
            <Input value={linkName} onChange={(e) => setLinkName(e.target.value)} />
          </label>
          <Row>
            <DialogButton type="submit" primary disabled={!own || !partner || action.isPending}>
              {m.LINK()}
            </DialogButton>
          </Row>
        </form>
      )}

    </>
  );
};

// Direct links of a device: list, parameters, add and remove
export const Links = ({ interfaceName, deviceAddress, channels }: LinksProps) => {
  const t = useTranslations();
  const { showToast } = useToast();
  const { data: links = [], isPending: linksLoading } = useLinks(interfaceName, deviceAddress);
  const { data: devices = [] } = useDevices();
  const names = useChannelNames();
  const action = useLinkAction();
  const [open, setOpen] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Link | null>(null);
  const label = (address: string) => `${names.get(address) ?? address} (${address})`;
  const channelInfo = useLinkChannelInfo();

  return (
    <>
      {linksLoading ? (
        <PanelSkeleton lines={2} />
      ) : links.length === 0 ? (
        <p>{m.NO_LINKS()}</p>
      ) : (
        <ul
          aria-label={m.LINKS()}
          className="flex flex-col divide-y rounded-lg border [&>li]:flex [&>li]:flex-col [&>li]:gap-3 [&>li]:p-3"
        >
          {links.map((link) => {
            const key = `${link.sender}>${link.receiver}`;
            return (
              <li key={key}>
                <Row>
                  <span className="min-w-[200px] flex-1 text-sm">
                    {label(link.sender)} → {label(link.receiver)}
                    {link.name ? ` · ${link.name}` : ''}
                  </span>
                  <DialogButton type="button" onClick={() => setOpen(open === key ? null : key)} aria-expanded={open === key}>
                    {m.LINK_PARAMETERS()}
                  </DialogButton>
                  <DialogButton type="button" onClick={() => setRemoving(link)}>
                    {m.REMOVE()}
                  </DialogButton>
                </Row>
                {open === key && (
                  <LinkParameters
                    interfaceName={interfaceName}
                    link={link}
                    receiverType={channelInfo.get(link.receiver)?.channel.type}
                    senderType={channelInfo.get(link.sender)?.channel.type}
                    senderDeviceType={channelInfo.get(link.sender)?.deviceType}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}

      <AddLinkForm interfaceName={interfaceName} deviceAddress={deviceAddress} channels={channels} />

      {removing && (
        <ConfirmDialog
          title={m.REMOVE_LINK()}
          confirmLabel={m.REMOVE()}
          busy={action.isPending}
          onCancel={() => setRemoving(null)}
          onConfirm={() =>
            action.mutate(
              { type: 'removeLink', interfaceName, sender: removing.sender, receiver: removing.receiver },
              {
                onSuccess: () => showToast(m.LINK_REMOVED(), 'info'),
                onError: (error) => showToast(`${m.CHANGE_FAILED()}: ${error.message}`),
                onSettled: () => setRemoving(null),
              },
            )
          }
        >
          <p>{m.REMOVE_LINK_CONFIRM()}</p>
          <p>
            {label(removing.sender)} → {label(removing.receiver)}
          </p>
        </ConfirmDialog>
      )}
    </>
  );
};
