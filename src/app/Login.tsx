import { FormEvent, useEffect, useState } from 'react';
import { useLogin } from '../hooks/useApi';
import { useRedirectToRooms } from '../hooks/useCheckSession';
import { useTranslations } from './../i18n/utils';
import styled from '@emotion/styled';

const Container = styled.div`
  max-width: 400px;
  margin: 20px auto; // hinzugefügt
  padding: 20px 20px; // geändert
  border: 1px solid #ccc;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  font-family: 'Roboto', sans-serif;
`;

const Title = styled.h4`
  margin-top: 0px;
  margin-bottom: 16px;
  font-size: 24px;
  text-align: center;
`;

const Alert = styled.div`
  background-color: #f8d7da;
  color: #721c24;
  padding: 10px;
  border: 1px solid #f5c6cb;
  border-radius: 4px;
  margin-bottom: 16px;
`;

const AlertBox = styled.div`
  font-weight: bold;
`;

const InputGroup = styled.div`
  margin-top: 16px;
`;

const Label = styled.label`
  display: block;
  margin-bottom: 8px;
`;

const Input = styled.input`
  width: 100%;
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  box-sizing: border-box; // hinzugefügt
`;

const ButtonGroup = styled.div`
  margin-top: 20px;
`;

const Button = styled.button`
  width: 100%;
  padding: 12px;
  background-color: #1976d2;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;

  &:hover {
    background-color: #1565c0;
  }
`;

const CheckboxGroup = styled.div`
  margin-top: 16px;
  display: flex;
  align-items: center;
`;

const Checkbox = styled.input`
  appearance: none;
  width: 20px;
  height: 20px;
  border: 1px solid #ccc;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  margin-right: 8px;

  &:checked {
    background-color: #1976d2;
    border: none;
  }

  &:checked::after {
    content: '';
    display: block;
    width: 20px; // geändert
    height: 20px; // geändert
    background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M20.285 6.708l-11.285 11.285-5.285-5.285 1.415-1.415 3.87 3.87 9.87-9.87z"/></svg>');
    background-size: contain; // geändert
    background-repeat: no-repeat;
  }
`;

const CheckboxLabel = styled.label`
  display: flex;
  align-items: center;
  font-size: 16px;
  cursor: pointer;
  margin-left: 8px;
`;

export const Login = () => {
  const loginMutation = useLogin();

  const t = useTranslations();

  const { navigateRooms } = useRedirectToRooms();
  const userNameFromSession = localStorage.getItem('ccu_addom-mui_username') || '';
  const passwordFromSession = localStorage.getItem('ccu_addom-mui_password') || '';
  const [rememberMe, setRememberMe] = useState(!!userNameFromSession && !!passwordFromSession);

  const [username, setUsername] = useState(userNameFromSession);
  const [password, setPassword] = useState(passwordFromSession);

  useEffect(() => {
    if (userNameFromSession && passwordFromSession) {
      setUsername(userNameFromSession);
      setPassword(passwordFromSession);
    };
  }, [userNameFromSession, passwordFromSession]);


  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRememberMe(e.target.checked);
  };

  const Login = async (d: FormEvent<HTMLFormElement>) => {
    d.preventDefault();
    const username = d.currentTarget['username'].value;
    const password = d.currentTarget['password'].value;
    if (rememberMe) {
      localStorage.setItem('ccu_addom-mui_username', username);
      localStorage.setItem('ccu_addom-mui_password', password);
    }
    const response = await loginMutation.mutateAsync({ username, password });
    if (response) {
      navigateRooms();
    }
  };

  return (
    <Container>
      <Title>{t('signInTitle')}</Title>
      {loginMutation.isError && (
        <Alert>
          <AlertBox>{t('errorOccuredWhileLogin')}</AlertBox>
          <p>{(loginMutation.error as Error).message}</p>
        </Alert>
      )}
      <form onSubmit={Login}>
        <InputGroup>
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            name="username"
            placeholder="Enter username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </InputGroup>
        <InputGroup>
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            placeholder="Enter password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </InputGroup>
        <CheckboxGroup>
          <Checkbox
            type="checkbox"
            id="rememberMe"
            checked={rememberMe}
            onChange={handleCheckboxChange}
          />
          <CheckboxLabel htmlFor="rememberMe">{t('rememberMe')}</CheckboxLabel>
        </CheckboxGroup>
        <ButtonGroup>
          <Button type="submit">{t('SIGN_IN')}</Button>
        </ButtonGroup>
      </form>
    </Container>
  );
};