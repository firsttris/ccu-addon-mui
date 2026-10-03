import { useState } from 'react';
import styled from '@emotion/styled';
import { useWebSocketContext } from '../hooks/useWebsocket';
import { TranslationKey, useTranslations } from '../i18n/utils';
import { m } from '../paraglide/messages';

const Container = styled.div`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  box-sizing: border-box;
`;

const Form = styled.form`
  width: 100%;
  max-width: 340px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 24px;
  border-radius: 12px;
  border: 1px solid ${(props) => props.theme.colors.border};
  background: ${(props) => props.theme.colors.surface};
  color: ${(props) => props.theme.colors.text};
`;

const Title = styled.h1`
  margin: 0;
  font-size: 22px;
  text-align: center;
`;

const Hint = styled.p`
  margin: 0;
  font-size: 14px;
  color: ${(props) => props.theme.colors.textSecondary};
  text-align: center;
`;

const Label = styled.label`
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 14px;
`;

const Input = styled.input`
  font-size: 17px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid ${(props) => props.theme.colors.border};
  background: ${(props) => props.theme.colors.background};
  color: ${(props) => props.theme.colors.text};
`;

const SubmitButton = styled.button`
  font-size: 17px;
  font-weight: 600;
  padding: 12px;
  border: none;
  border-radius: 8px;
  color: #fff;
  background: #1976d2;
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`;

const ErrorText = styled.p`
  margin: 0;
  color: #c62828;
  font-size: 14px;
  text-align: center;
`;

const errorMessages: Record<string, TranslationKey> = {
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOO_MANY_ATTEMPTS: 'TOO_MANY_ATTEMPTS',
  CCU_UNREACHABLE: 'CCU_UNREACHABLE',
};

export const Login = () => {
  const t = useTranslations();
  const { login, loginError, connectionStatus } = useWebSocketContext();
  const [username, setUsername] = useState('Admin');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const connected = connectionStatus === 'Open';

  // A new error (or a successful login, which unmounts this view) ends submitting
  const [lastError, setLastError] = useState(loginError);
  if (loginError !== lastError) {
    setLastError(loginError);
    setSubmitting(false);
  }

  return (
    <Container>
      <Form
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitting(true);
          login(username, password);
        }}
      >
        <Title>CCU Addon MUI</Title>
        <Hint>{m.LOGIN_HINT()}</Hint>
        <Label>
          {m.USERNAME()}
          <Input
            name="username"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </Label>
        <Label>
          {m.PASSWORD()}
          <Input
            name="password"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Label>
        {loginError && (
          <ErrorText role="alert">{t(errorMessages[loginError] ?? 'INVALID_CREDENTIALS')}</ErrorText>
        )}
        {!connected && <Hint>{m.CONNECTING()}</Hint>}
        <SubmitButton type="submit" disabled={!connected || submitting || username === ''}>
          {m.SIGN_IN()}
        </SubmitButton>
      </Form>
    </Container>
  );
};
