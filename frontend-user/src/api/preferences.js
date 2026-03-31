import client from './client';

export async function getNotificationPreferences() {
  const { data } = await client.get('/api/preferences/notifications');
  return data;
}

export async function saveNotificationPreferences({ notifications_enabled, preferences }) {
  const { data } = await client.put('/api/preferences/notifications', {
    notifications_enabled,
    preferences,
  });
  return data;
}
