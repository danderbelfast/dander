'use strict';

const cron  = require('node-cron');
const axios = require('axios');
const pool  = require('../db/pool');

const BASE_URL = process.env.OPEN_METEO_BASE_URL || 'https://api.open-meteo.com';

const WMO_CONDITIONS = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Rime fog',
  51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
  61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
  66: 'Light freezing rain', 67: 'Heavy freezing rain',
  71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Slight showers', 81: 'Moderate showers', 82: 'Violent showers',
  85: 'Slight snow showers', 86: 'Heavy snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with slight hail', 99: 'Thunderstorm with heavy hail',
};

async function fetchCurrentWeather(lat, lng) {
  const url = `${BASE_URL}/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,wind_speed_10m,rain,weather_code&timezone=Europe%2FLondon`;
  const { data } = await axios.get(url, { timeout: 10000 });
  const c = data.current;
  return {
    temperature_c:  c.temperature_2m,
    wind_speed_kmh: c.wind_speed_10m,
    rainfall_mm:    c.rain || 0,
    weather_code:   c.weather_code,
    condition:      WMO_CONDITIONS[c.weather_code] || 'Unknown',
  };
}

async function collectWeatherForAllBusinesses() {
  const { rows: businesses } = await pool.query(
    `SELECT DISTINCT b.id, b.lat, b.lng
     FROM businesses b
     JOIN kilo_devices d ON d.business_id = b.id
     WHERE d.status = 'active' AND b.lat IS NOT NULL AND b.lng IS NOT NULL`
  );

  if (businesses.length === 0) return 0;

  let stored = 0;
  for (const biz of businesses) {
    try {
      const weather = await fetchCurrentWeather(biz.lat, biz.lng);
      await pool.query(
        `INSERT INTO weather_readings (business_id, temperature_c, wind_speed_kmh, rainfall_mm, weather_code, condition)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [biz.id, weather.temperature_c, weather.wind_speed_kmh, weather.rainfall_mm, weather.weather_code, weather.condition]
      );
      stored++;
    } catch (err) {
      console.error(`[weather] Failed for business ${biz.id}:`, err.message);
    }
  }

  return stored;
}

function scheduleWeatherCollection() {
  const task = cron.schedule('*/30 * * * *', async () => {
    try {
      const count = await collectWeatherForAllBusinesses();
      if (count > 0) console.log(`[weather] Collected weather for ${count} business(es).`);
    } catch (err) {
      console.error('[weather] Collection failed:', err.message);
    }
  });
  console.log('[weather] Scheduler started — runs every 30 minutes.');
  return task;
}

module.exports = { fetchCurrentWeather, collectWeatherForAllBusinesses, scheduleWeatherCollection };
