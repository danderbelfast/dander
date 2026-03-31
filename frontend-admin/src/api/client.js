import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

let _accessToken = '';
let _refreshPromise = null;

export function setAccessToken(t) { _accessToken = t; }
export function getAccessToken()  { return _accessToken; }
export function clearAccessToken() { _accessToken = ''; }

const client = axios.create({ baseURL: BASE_URL, timeout: 15_000 });

client.interceptors.request.use((cfg) => {
  if (_accessToken) cfg.headers.Authorization = `Bearer ${_accessToken}`;
  return cfg;
});

client.interceptors.response.use(
  (r) => r,
  async (err) => {
    const orig = err.config;
    if (err.response?.status === 401 && !orig._retry) {
      orig._retry = true;
      if (!_refreshPromise) {
        _refreshPromise = axios
          .post(`${BASE_URL}/api/auth/refresh`, { refreshToken: localStorage.getItem('admin_refresh') })
          .then((r) => { setAccessToken(r.data.accessToken); return r.data.accessToken; })
          .catch(() => {
            clearAccessToken();
            localStorage.removeItem('admin_refresh');
            window.dispatchEvent(new Event('admin:logout'));
            return Promise.reject(err);
          })
          .finally(() => { _refreshPromise = null; });
      }
      try {
        const tok = await _refreshPromise;
        orig.headers.Authorization = `Bearer ${tok}`;
        return client(orig);
      } catch { return Promise.reject(err); }
    }
    return Promise.reject(err);
  }
);

export default client;
