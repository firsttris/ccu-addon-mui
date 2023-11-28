import { Box, Button, TextField } from '@mui/material';
import { Container } from '@mui/system';
import { FormEvent, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLogin, useSessionId } from '../hooks/useApi';

export const Login = () => {
  const loginMutation = useLogin();

  const navigate = useNavigate()

  const sessionId = useSessionId();

  useEffect(() => {
    if(sessionId) {
      navigate('/rooms');
    }
  }, [sessionId])

  const Login = async (d: FormEvent<HTMLFormElement>) => {
    d.preventDefault();
    const username = d.currentTarget['username'].value;
    const password = d.currentTarget['password'].value;
    const response = await loginMutation.mutateAsync({ username, password });
    if(response) {
      navigate('/rooms');
    }
  };

  return (
    <Container maxWidth="xs">
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
            Sign in
          </Button>
        </Box>
      </form>
    </Container>
  );
};
