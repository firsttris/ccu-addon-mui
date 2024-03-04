import { Alert, Box, Button, TextField, Typography } from '@mui/material';
import { Container } from '@mui/system';
import { FormEvent } from 'react';
import { useLogin } from '../hooks/useApi';
import { useRedirectToRooms } from '../hooks/useCheckSession';
import { useTranslations } from './../i18n/utils';

export const Login = () => {
  const loginMutation = useLogin();

  const t = useTranslations();

  const { navigateRooms } = useRedirectToRooms();

  const Login = async (d: FormEvent<HTMLFormElement>) => {
    d.preventDefault();
    const username = d.currentTarget['username'].value;
    const password = d.currentTarget['password'].value;
    const response = await loginMutation.mutateAsync({ username, password });
    if (response) {
      navigateRooms();
    }
  };

  return (
    <Container maxWidth="xs">
      <Typography variant="h4" sx={{ mt: 6, mb: 3 }}>
        {t('signInTitle')}
      </Typography>
      {loginMutation.isError && (
        <Alert severity="error">
          <Box>
            <Typography fontWeight={'bold'}>{t('errorOccuredWhileLogin')}</Typography>
            <Typography>{(loginMutation.error as Error).message}</Typography>
          </Box>
        </Alert>
      )}
      <form onSubmit={Login}>
        <Box sx={{ mt: 4 }}>
          <TextField
            name="username"
            label="Username"
            placeholder="Enter username"
            variant="standard"
            fullWidth
            required
          />
        </Box>
        <Box sx={{ mt: 2 }}>
          <TextField
            name="password"
            label="Password"
            placeholder="Enter password"
            type="password"
            variant="standard"
            fullWidth
            required
          />
        </Box>
        <Box sx={{ mt: 6 }}>
          <Button type="submit" value="submit" variant="contained" fullWidth>
            {t('SIGN_IN')}
          </Button>
        </Box>
      </form>
    </Container>
  );
};
