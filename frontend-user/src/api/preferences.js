import client from './client';

export async function getNotificationPreferences() {
  const { data } = await client.get('/api/preferences/notifications');
  return data;
}

export async function saveNotificationPreferences({
  notifications_enabled,
  preferences,
  notification_types,
  quiet_hours,
  sounds_enabled,
  haptics_enabled,
  alert_volume,
}) {
  const { data } = await client.put('/api/preferences/notifications', {
    notifications_enabled,
    preferences,
    notification_types,
    quiet_hours,
    sounds_enabled,
    haptics_enabled,
    alert_volume,
  });
  return data;
}

