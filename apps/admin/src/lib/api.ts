import axios from 'axios';

const api = axios.create({
  baseURL: '',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refreshToken = localStorage.getItem('admin_refresh');
      if (refreshToken) {
        try {
          const res = await axios.post('/api/v1/auth/refresh-token', { refreshToken });
          const { accessToken, refreshToken: newRefresh } = res.data.data;
          localStorage.setItem('admin_token', accessToken);
          if (newRefresh) localStorage.setItem('admin_refresh', newRefresh);
          original.headers.Authorization = `Bearer ${accessToken}`;
          return api(original);
        } catch {
          localStorage.removeItem('admin_token');
          localStorage.removeItem('admin_refresh');
          localStorage.removeItem('admin_user');
          window.location.href = '/login';
        }
      } else {
        localStorage.removeItem('admin_token');
        localStorage.removeItem('admin_user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

export default api;

export function getErrorMessage(err: unknown): string {
  const axErr = err as { response?: { data?: { error?: { message?: string } } } };
  return axErr?.response?.data?.error?.message ?? 'An unexpected error occurred.';
}
