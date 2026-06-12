import { API_URL as API_BASE } from '../config';

export function resolveImageUrl(url) {
  if (!url) return '';
  if (url.startsWith('/uploads/')) return `${API_BASE}${url}`;
  return url;
}
