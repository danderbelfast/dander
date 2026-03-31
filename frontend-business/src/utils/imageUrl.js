const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

/**
 * Resolves an image URL from the database.
 * Local /uploads/ paths are absolute URLs for the backend server.
 * Cloudinary/external URLs are returned as-is.
 * Blob object URLs (created during upload preview) are also returned as-is.
 */
export function resolveImageUrl(url) {
  if (!url) return '';
  if (url.startsWith('/uploads/')) return `${API_BASE}${url}`;
  return url;
}
