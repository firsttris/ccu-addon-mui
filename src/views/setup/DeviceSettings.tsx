import styled from '@emotion/styled';
import { useCallback, useMemo, useState } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { useQueries } from '@tanstack/react-query';
import { useDevices, useParamset, usePutParamset } from '../../queries';
import { useWebSocketActions, useWebSocketContext } from '../../hooks/useWebsocket';
import { useToast } from '../../contexts/ToastContext';
import { TranslationKey, useTranslations } from '../../i18n/utils';
import { DatapointValue, ParamsetDescription } from '../../types/types';
import { formatParameterValue, ParamsetView, shownParameters } from '../../controls/generic/ParamsetView';
import { ConfirmDialog, DialogButton } from '../../components/ConfirmDialog';
import { WebUILink } from '../../components/WebUILink';
import { Notice, SetupContainer } from './Setup';
import { useChannelNames } from './channelNames';

const Section = styled.section`
  margin: 16px 0;
  padding: 12px 16px;
  max-width: 520px;
  border: 1px solid ${(props) => props.theme.colors.border};
  border-radius: 8px;
  background: ${(props) => props.theme.colors.surface};

  h2 {
    margin: 0 0 10px;
    font-size: 16px;
  }
`;

const Toolbar = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  margin: 12px 0;
`;

const Changes = styled.ul`
  margin: 0;
  padding-left: 18px;
  font-size: 14px;

  li {
    margin: 4px 0;
  }
`;

type Values = Record<string, DatapointValue>;

// Settings (MASTER paramsets) of a device and its channels. Changes are
// collected first and saved after a confirmation listing old and new
// values.
export const DeviceSettings = () => {
  const { interfaceName, address } = useParams({ from: '/device/$interfaceName/$address' });
  const t = useTranslations();
  const { showToast } = useToast();
  const { request } = useWebSocketActions();
  const { userLevel } = useWebSocketContext();
  const isAdmin = userLevel === 'admin';
  const { data: devices } = useDevices();
  const names = useChannelNames();
  const putParamset = usePutParamset();

  const device = devices?.find((d) => d.address === address && d.interfaceName === interfaceName);
  // Device-wide settings are on the device (BidCos) or its channel 0 (HmIP)
  const addresses = useMemo(() => [address, ...(device?.children ?? [])], [address, device]);

  const descriptions = useQueries({
    queries: addresses.map((a) => ({
      queryKey: ['paramsetDescription', interfaceName, a, 'MASTER'],
      queryFn: async () =>
        ((await request({ type: 'getParamsetDescription', interfaceName, address: a, paramsetKey: 'MASTER' }))
          .description ?? {}) as ParamsetDescription,
      staleTime: Infinity,
      retry: false,
    })),
  });
  const values = useQueries({
    queries: addresses.map((a) => ({
      queryKey: ['paramset', interfaceName, a, 'MASTER'],
      queryFn: async () =>
        ((await request({ type: 'getParamset', interfaceName, address: a, paramsetKey: 'MASTER' })).values ??
          {}) as Values,
      retry: false,
    })),
  });

  // Battery devices only fetch new settings when woken up
  const { data: maintenance } = useParamset(interfaceName, `${address}:0`, 'VALUES', {
    enabled: device?.children?.includes(`${address}:0`) === true,
  });
  const configPending = maintenance?.CONFIG_PENDING === true;

  const [drafts, setDrafts] = useState<Record<string, Values>>({});
  const [confirming, setConfirming] = useState(false);

  const setDraft = useCallback(
    (a: string, current: Values, name: string, value: DatapointValue) =>
      setDrafts((prev) => {
        const next = { ...(prev[a] ?? {}), [name]: value };
        // Back to the saved value: no change
        if (current[name] === value) {
          delete next[name];
        }
        return { ...prev, [a]: next };
      }),
    [],
  );

  const sections = addresses
    .map((a, i) => ({ address: a, description: descriptions[i].data, current: values[i].data ?? {} }))
    .filter((s): s is { address: string; description: ParamsetDescription; current: Values } =>
      s.description !== undefined && shownParameters(s.description).length > 0,
    );

  const changes = sections.flatMap((s) =>
    Object.entries(drafts[s.address] ?? {}).map(([name, value]) => ({
      address: s.address,
      name,
      parameter: s.description[name],
      previous: s.current[name],
      value,
    })),
  );

  const save = async () => {
    try {
      for (const s of sections) {
        const draft = drafts[s.address];
        if (draft && Object.keys(draft).length > 0) {
          await putParamset.mutateAsync({ interfaceName, address: s.address, values: draft });
        }
      }
      setDrafts({});
      showToast(t('SAVED'), 'info');
    } catch (error) {
      showToast(`${t('SAVE_FAILED')}: ${error instanceof Error ? error.message : error}`);
    } finally {
      setConfirming(false);
    }
  };

  const loading = descriptions.some((d) => d.isPending);

  return (
    <SetupContainer>
      <p>
        <Link to="/setup">← {t('DEVICES')}</Link>
      </p>
      <h1>{names.get(address) ?? address}</h1>
      <p>
        {device?.type} · {address} · {interfaceName}
        {device?.firmware ? ` · ${t('FIRMWARE')} ${device.firmware}` : ''} · <WebUILink />
      </p>
      {!isAdmin && <Notice role="status">{t('ADMIN_ONLY')}</Notice>}
      {configPending && <Notice role="status">{t('CONFIG_PENDING')}</Notice>}

      {sections.map((s) => {
        const draft = drafts[s.address] ?? {};
        const label = s.address === address ? t('DEVICE_SETTINGS') : (names.get(s.address) ?? s.address);
        return (
          <Section key={s.address} aria-label={label}>
            <h2>
              {label} <small>({s.address})</small>
            </h2>
            <ParamsetView
              label={`${label} ${s.address}`}
              description={s.description}
              values={{ ...s.current, ...draft }}
              changed={new Set(Object.keys(draft))}
              readOnly={!isAdmin}
              onSet={(name, value) => setDraft(s.address, s.current, name, value)}
            />
          </Section>
        );
      })}
      {!loading && sections.length === 0 && <p>{t('NO_SETTINGS')}</p>}

      {isAdmin && sections.length > 0 && (
        <Toolbar>
          <DialogButton type="button" primary disabled={changes.length === 0} onClick={() => setConfirming(true)}>
            {t('SAVE')} {changes.length > 0 ? `(${changes.length})` : ''}
          </DialogButton>
          <DialogButton type="button" disabled={changes.length === 0} onClick={() => setDrafts({})}>
            {t('RESET')}
          </DialogButton>
        </Toolbar>
      )}

      {confirming && (
        <ConfirmDialog
          title={t('SAVE_CHANGES')}
          confirmLabel={t('SAVE')}
          busy={putParamset.isPending}
          onConfirm={save}
          onCancel={() => setConfirming(false)}
        >
          <Changes>
            {changes.map((c) => (
              <li key={`${c.address}.${c.name}`}>
                <strong>{t(c.name as TranslationKey)}</strong> ({names.get(c.address) ?? c.address}):{' '}
                {formatParameterValue(c.parameter, c.previous, t)} → {formatParameterValue(c.parameter, c.value, t)}
              </li>
            ))}
          </Changes>
        </ConfirmDialog>
      )}
    </SetupContainer>
  );
};
