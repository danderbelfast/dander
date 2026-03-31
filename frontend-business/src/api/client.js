import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

let _accessToken  = null;
let _refreshPromise = null;

export function setAccessToken(t) { _accessToken = t; }
export function getAccessToken()  { return _accessToken; }
export function clearAccessToken(){ _accessToken = null; }

export const client = axios.create({ baseURL: BASE_URL, timeout: 15_000 });

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
      const rt = localStorage.getItem('biz_refresh');
      if (!rt) { clearAccessToken(); window.dispatchEvent(new Event('biz:logout')); return Promise.reject(err); }
      if (!_refreshPromise) {
        _refreshPromise = axios.post(`${BASE_URL}/api/auth/refresh`, { refreshToken: rt })
          .then(({ data }) => { setAccessToken(data.accessToken); return data.accessToken; })
          .catch((e) => {
            localStorage.removeItem('biz_refresh');
            clearAccessToken();
            window.dispatchEvent(new Event('biz:logout'));
            return Promise.reject(e);
          })
          .finally(() => { _refreshPromise = null; });
      }
      try {
        const token = await _refreshPromise;
        orig.headers.Authorization = `Bearer ${token}`;
        return client(orig);
      } catch { return Promise.reject(err); }
    }
    return Promise.reject(err);
  }
);

export default client;
