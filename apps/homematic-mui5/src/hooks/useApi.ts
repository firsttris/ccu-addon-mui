
import axios from "axios";
import {
  useQuery,
  useMutation
} from '@tanstack/react-query'


const callApi = async (method: string, params?: any) => {
  return await axios.post('/api/homematic.cgi', {
    method,
    params: { ...params, _session_id_: sessionStorage.getItem('session_id')}
  });
}

const login = async (username: string, password: string) => {
  const response = await callApi('Session.login', { username, password });
  sessionStorage.setItem('session_id', response.data.result)
}

export const useApi = (method: string, params?: any) => {
  return useQuery({ queryKey: [method, params], queryFn: () => callApi(method, params) })
}

export const useLogin = () => {
  return useMutation({
    mutationFn: (credentials: { username: string, password: string}) => {
      const { username, password } = credentials
      return login(username, password)
    }
  })
}