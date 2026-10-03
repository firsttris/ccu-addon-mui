import styled from '@emotion/styled';
import { useMemo, useState } from 'react';
import { useDevices, useLinkAction, useLinkParamset, useLinks } from '../../queries';
import { useToast } from '../../contexts/ToastContext';
import { TranslationKey, useTranslations } from '../../i18n/utils';
import { DatapointValue, DeviceChannel, Link } from '../../types/types';
import { ConfirmDialog, DialogButton } from '../../components/ConfirmDialog';
import { formatParameterValue, ParamsetView, shownParameters } from '../../controls/generic/ParamsetView';
import { useChannelNames } from './channelNames';
import { m } from '../../paraglide/messages';

const LinkList = styled.ul`
  list-style: none;
  margin: 0 0 12px;
  padding: 0;

  > li {
    padding: 8px 0;
    border-bottom: 1px solid ${(props) => props.theme.colors.border};
  }
`;

const Row = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
`;

const Form = styled.form`
  display: grid;
  gap: 8px;
  max-width: 420px;

  label {
    display: grid;
    gap: 2px;
    font-size: 13px;
  }

  select,
  input {
    font: inherit;
    padding: 6px;
  }
`;

const Hint = styled.p`
  font-size: 12px;
  color: ${(props) => props.theme.colors.textSecondary};
`;

const shareRole = (a: string[] = [], b: string[] = []) => a.some((role) => b.includes(role));

// The parameters of one link on the receiver's side, edited like device
// settings: collect changes, confirm, save.
const LinkParameters = ({ interfaceName, link }: { interfaceName: string; link: Link }) => {
  const t = useTranslations();
  const { showToast } = useToast();
  const { description, values } = useLinkParamset(interfaceName, link.receiver, link.sender);
  const action = useLinkAction();
  const [draft, setDraft] = useState<Record<string, DatapointValue>>({});
  const [confirming, setConfirming] = useState(false);

  if (!description.data || !values.data) {
    return null;
  }
  const current = values.data;
  const changes = Object.entries(draft);

  return (
    <>
      <Hint>{m.LINK_PROFILES_HINT()}</Hint>
      {shownParameters(description.data).length > 0 && (
        <ParamsetView
          label={`${m.LINK_PARAMETERS()} ${link.sender} ${link.receiver}`}
          description={description.data}
          values={{ ...current, ...draft }}
          changed={new Set(Object.keys(draft))}
          onSet={(name, value) =>
            setDraft((prev) => {
              const next = { ...prev, [name]: value };
              if (current[name] === value) delete next[name];
              return next;
            })
          }
        />
      )}
      <Row style={{ marginTop: 8 }}>
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
                  showToast(m.SAVED(), 'info');
                },
                onError: (error) => showToast(`${m.SAVE_FAILED()}: ${error.message}`),
                onSettled: () => setConfirming(false),
              },
            )
          }
        >
          <ul>
            {changes.map(([name, value]) => (
              <li key={name}>
                <strong>{t(name as TranslationKey)}</strong>:{' '}
                {formatParameterValue(description.data[name], current[name], t)} →{' '}
                {formatParameterValue(description.data[name], value, t)}
              </li>
            ))}
          </ul>
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

// Direct links of a device: list, parameters, add and remove
export const Links = ({ interfaceName, deviceAddress, channels }: LinksProps) => {
  const t = useTranslations();
  const { showToast } = useToast();
  const { data: links = [] } = useLinks(interfaceName, deviceAddress);
  const { data: devices = [] } = useDevices();
  const names = useChannelNames();
  const action = useLinkAction();
  const [open, setOpen] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Link | null>(null);

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

  const label = (address: string) => `${names.get(address) ?? address} (${address})`;

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
      {links.length === 0 ? (
        <p>{m.NO_LINKS()}</p>
      ) : (
        <LinkList aria-label={m.LINKS()}>
          {links.map((link) => {
            const key = `${link.sender}>${link.receiver}`;
            return (
              <li key={key}>
                <Row>
                  <span style={{ flex: 1, minWidth: 200 }}>
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
                {open === key && <LinkParameters interfaceName={interfaceName} link={link} />}
              </li>
            );
          })}
        </LinkList>
      )}

      {linkable.length > 0 && (
        <Form
          aria-label={m.ADD_LINK()}
          onSubmit={(event) => {
            event.preventDefault();
            add();
          }}
        >
          <strong>{m.ADD_LINK()}</strong>
          <label>
            {m.LINK_OWN_CHANNEL()}
            <select
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
            </select>
          </label>
          <label>
            {m.LINK_PARTNER()}
            <select value={partner} disabled={!ownChannel} onChange={(e) => setPartner(e.target.value)}>
              <option value="" />
              {partners.map((c) => (
                <option key={c.address} value={c.address}>
                  {label(c.address)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {m.LINK_NAME()}
            <input value={linkName} onChange={(e) => setLinkName(e.target.value)} />
          </label>
          <Row>
            <DialogButton type="submit" primary disabled={!own || !partner || action.isPending}>
              {m.LINK()}
            </DialogButton>
          </Row>
        </Form>
      )}

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
