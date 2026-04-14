const API_BASE = import.meta.env.VITE_API_URL || '';

export function resolveImageUrl(url) {
  if (!url) return '';
  if (url.startsWith('/uploads/')) return `${API_BASE}${url}`;
  return url;
}
