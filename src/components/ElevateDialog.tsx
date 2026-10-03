import styled from '@emotion/styled';
import { useState } from 'react';
import { ConfirmDialog } from './ConfirmDialog';
import { RequestError, useWebSocketActions } from '../hooks/useWebsocket';
import { TranslationKey, useTranslations } from '../i18n/utils';

const Input = styled.input`
  font: inherit;
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  margin-top: 8px;
  border: 1px solid ${(props) => props.theme.colors.border};
  border-radius: 6px;
  color: ${(props) => props.theme.colors.text};
  background: ${(props) => props.theme.colors.background};
`;

const ErrorText = styled.p`
  margin: 8px 0 0;
  color: #c62828;
`;

const errorMessages: Record<string, TranslationKey> = {
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOO_MANY_ATTEMPTS: 'TOO_MANY_ATTEMPTS',
  CCU_UNREACHABLE: 'CCU_UNREACHABLE',
};

// Asks for the password again before settings may be changed
export const ElevateDialog = ({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) => {
  const t = useTranslations();
  const { elevate } = useWebSocketActions();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await elevate(password);
      onDone();
    } catch (e) {
      const code = e instanceof RequestError ? e.code : undefined;
      setError(t(errorMessages[code ?? ''] ?? 'INVALID_CREDENTIALS'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConfirmDialog title={t('ELEVATE')} confirmLabel={t('CONFIRM')} busy={busy || password === ''} onConfirm={submit} onCancel={onCancel}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (password !== '') {
            submit();
          }
        }}
      >
        <label>
          {t('ELEVATE_HINT')}
          <Input
            type="password"
            aria-label={t('PASSWORD')}
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error && <ErrorText role="alert">{error}</ErrorText>}
      </form>
    </ConfirmDialog>
  );
};
