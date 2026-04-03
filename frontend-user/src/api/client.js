import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || '';

// Access token lives in memory only — never in localStorage or cookies
let _accessToken = null;
let _refreshPromise = null;

export function setAccessToken(token) { _accessToken = token; }
export function getAccessToken()      { return _accessToken;  }
export function clearAccessToken()    { _accessToken = null;  }

export const client = axios.create({
  baseURL: BASE_URL,
  timeout: 12_000,
});

// Attach Authorization header on every request
client.interceptors.request.use((config) => {
  if (_accessToken) {
    config.headers.Authorization = `Bearer ${_accessToken}`;
  }
  return config;
});

// Auto-refresh on 401
client.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;

    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;

      const refreshToken = localStorage.getItem('dander_refresh');
      if (!refreshToken) {
        clearAccessToken();
        window.dispatchEvent(new Event('dander:logout'));
        return Promise.reject(error);
      }

      // Collapse concurrent refresh calls into one
      if (!_refreshPromise) {
        _refreshPromise = axios
          .post(`${BASE_URL}/api/auth/refresh`, { refreshToken })
          .then(({ data }) => {
            setAccessToken(data.accessToken);
            return data.accessToken;
          })
          .catch((err) => {
            localStorage.removeItem('dander_refresh');
            clearAccessToken();
            window.dispatchEvent(new Event('dander:logout'));
            return Promise.reject(err);
          })
          .finally(() => { _refreshPromise = null; });
      }

      try {
        const newToken = await _refreshPromise;
        original.headers.Authorization = `Bearer ${newToken}`;
        return client(original);
      } catch {
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);

export default client;
