'use strict';

require('dotenv').config();
const pool = require('../db/pool');

const DAYS_BACK = 56;

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFloat(min, max, decimals = 1) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}

async function seedDevice(businessId, deviceSn, label) {
  const { rows: existing } = await pool.query(
    'SELECT id FROM kilo_devices WHERE device_id = $1', [deviceSn]
  );
  if (existing.length > 0) {
    console.log(`  Device ${deviceSn} already exists, skipping registration.`);
    return existing[0].id;
  }

  const { rows } = await pool.query(
    `INSERT INTO kilo_devices (business_id, device_id, label, status, device_type, first_reading_at, last_reading_at)
     VALUES ($1, $2, $3, 'active', 'people_counter', NOW() - INTERVAL '${DAYS_BACK} days', NOW())
     RETURNING id`,
    [businessId, deviceSn, label]
  );

  await pool.query(
    `INSERT INTO kilo_device_status (business_id, device_sn, device_name, firmware_version, hardware_version, last_seen, network_status)
     VALUES ($1, $2, $3, '3.2.1', 'VS125-2', NOW(), 'online')
     ON CONFLICT (device_sn) DO UPDATE SET last_seen = NOW()`,
    [businessId, deviceSn, label]
  );

  console.log(`  Registered device: ${deviceSn} (${label})`);
  return rows[0].id;
}

async function seedZones(businessId, deviceSn) {
  const zones = [
    { number: 1, name: 'Main Entrance', type: 'counting' },
    { number: 2, name: 'Seating Area', type: 'dwell' },
    { number: 3, name: 'Counter', type: 'counting' },
  ];

  let inserted = 0;
  for (const z of zones) {
    await pool.query(
      `INSERT INTO kilo_zone_configs (business_id, device_sn, zone_number, zone_name, zone_type)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (device_sn, zone_number) DO UPDATE SET zone_name = EXCLUDED.zone_name`,
      [businessId, deviceSn, z.number, z.name, z.type]
    );
    inserted++;
  }
  return inserted;
}

function hourlyBaseRate(hour) {
  if (hour < 8 || hour >= 20) return 0;
  if (hour >= 12 && hour <= 13) return 35;
  if (hour >= 11 && hour <= 14) return 28;
  if (hour >= 17 && hour <= 19) return 22;
  return 12;
}

async function seedReadings(businessId, deviceSn, deviceDbId) {
  const now = new Date();
  let readingsInserted = 0;
  let zonesInserted = 0;

  for (let d = DAYS_BACK; d >= 0; d--) {
    const date = new Date(now);
    date.setDate(date.getDate() - d);
    date.setHours(0, 0, 0, 0);

    for (let hour = 8; hour < 20; hour++) {
      const ts = new Date(date);
      ts.setHours(hour, 0, 0, 0);
      const tsStr = ts.toISOString();

      const base = hourlyBaseRate(hour);
      const variance = rand(-5, 5);
      const entries = Math.max(0, base + variance);
      const exits = Math.max(0, entries - rand(-3, 3));
      const occupancy = Math.max(0, rand(5, 25));

      const maleCount = Math.round(entries * 0.52);
      const femaleCount = entries - maleCount;
      const adultCount = Math.round(entries * 0.85);
      const childCount = Math.round(entries * 0.15);
      const staffCount = Math.round(entries * 0.05);
      const passersby = rand(entries, entries * 3);
      const effectiveAudience = Math.round(passersby * 0.3);
      const avgAttention = randFloat(2, 8, 2);
      const staffDwell = randFloat(120, 480, 2);

      // Zone 1: Main entrance — full counts
      await pool.query(
        `INSERT INTO kilo_people_counting
           (business_id, device_sn, zone_number, timestamp, interval_seconds,
            entries, exits, occupancy, male_count, female_count,
            adult_count, child_count, passersby, staff_count,
            staff_avg_dwell_time, effective_audience, avg_attention_time)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         ON CONFLICT (business_id, device_sn, timestamp, zone_number) DO UPDATE SET
           entries=EXCLUDED.entries, exits=EXCLUDED.exits, occupancy=EXCLUDED.occupancy`,
        [businessId, deviceSn, 1, tsStr, 3600,
         entries, exits, occupancy, maleCount, femaleCount,
         adultCount, childCount, passersby, staffCount,
         staffDwell, effectiveAudience, avgAttention]
      );
      zonesInserted++;

      // Zone 2: Seating — ~60% of entries, higher dwell
      const seatingEntries = Math.round(entries * 0.6);
      await pool.query(
        `INSERT INTO kilo_people_counting
           (business_id, device_sn, zone_number, timestamp, interval_seconds,
            entries, exits, occupancy, effective_audience, avg_attention_time)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (business_id, device_sn, timestamp, zone_number) DO UPDATE SET
           entries=EXCLUDED.entries, exits=EXCLUDED.exits, occupancy=EXCLUDED.occupancy`,
        [businessId, deviceSn, 2, tsStr, 3600,
         seatingEntries, Math.max(0, seatingEntries - rand(0, 3)),
         Math.round(occupancy * 0.7), seatingEntries, randFloat(15, 45, 2)]
      );
      zonesInserted++;

      // Zone 3: Counter — ~80% of entries, short dwell
      const counterEntries = Math.round(entries * 0.8);
      await pool.query(
        `INSERT INTO kilo_people_counting
           (business_id, device_sn, zone_number, timestamp, interval_seconds,
            entries, exits, occupancy, effective_audience, avg_attention_time)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (business_id, device_sn, timestamp, zone_number) DO UPDATE SET
           entries=EXCLUDED.entries, exits=EXCLUDED.exits, occupancy=EXCLUDED.occupancy`,
        [businessId, deviceSn, 3, tsStr, 3600,
         counterEntries, counterEntries, rand(1, 5), counterEntries, randFloat(1, 4, 2)]
      );
      zonesInserted++;

      // Also write to sensor_readings for baseline compatibility
      await pool.query(
        `INSERT INTO sensor_readings (device_id, business_id, device_type, reading_value, unit, recorded_at)
         VALUES ($1, $2, 'people_counter', $3, 'count', $4)`,
        [deviceDbId, businessId, entries, tsStr]
      );
      readingsInserted++;
    }
  }

  return { readingsInserted, zonesInserted };
}

async function seedWeather(businessId) {
  const now = new Date();
  let inserted = 0;

  const conditions = [
    { code: 0, name: 'Clear sky', tempRange: [14, 22], rain: 0 },
    { code: 2, name: 'Partly cloudy', tempRange: [12, 20], rain: 0 },
    { code: 3, name: 'Overcast', tempRange: [10, 16], rain: 0 },
    { code: 61, name: 'Slight rain', tempRange: [8, 14], rain: 2.5 },
    { code: 63, name: 'Moderate rain', tempRange: [7, 12], rain: 6 },
    { code: 1, name: 'Mainly clear', tempRange: [13, 21], rain: 0 },
  ];

  for (let d = DAYS_BACK; d >= 0; d--) {
    const date = new Date(now);
    date.setDate(date.getDate() - d);

    const dayCondition = conditions[rand(0, conditions.length - 1)];

    for (let hour = 8; hour < 20; hour += 2) {
      const ts = new Date(date);
      ts.setHours(hour, 0, 0, 0);

      await pool.query(
        `INSERT INTO weather_readings (business_id, temperature_c, wind_speed_kmh, rainfall_mm, weather_code, condition, recorded_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          businessId,
          randFloat(dayCondition.tempRange[0], dayCondition.tempRange[1]),
          randFloat(5, 30),
          dayCondition.rain > 0 ? randFloat(0, dayCondition.rain) : 0,
          dayCondition.code,
          dayCondition.name,
          ts.toISOString(),
        ]
      );
      inserted++;
    }
  }
  return inserted;
}

async function main() {
  try {
    // Find a business to seed (use the first active one)
    const { rows: businesses } = await pool.query(
      `SELECT id, name FROM businesses WHERE status = 'active' ORDER BY id LIMIT 1`
    );

    if (businesses.length === 0) {
      console.error('No active businesses found. Create one first.');
      process.exit(1);
    }

    const biz = businesses[0];
    console.log(`Seeding Kilo data for: ${biz.name} (ID: ${biz.id})`);

    const deviceSn = 'kilo_bel_0042';
    const deviceDbId = await seedDevice(biz.id, deviceSn, 'Front Door Counter');

    console.log('  Seeding zones...');
    const zonesCreated = await seedZones(biz.id, deviceSn);
    console.log(`  ✓ ${zonesCreated} zones configured`);

    console.log(`  Seeding ${DAYS_BACK} days of readings (8am-8pm, 3 zones)...`);
    const { readingsInserted, zonesInserted } = await seedReadings(biz.id, deviceSn, deviceDbId);
    console.log(`  ✓ ${readingsInserted} sensor readings + ${zonesInserted} zone readings`);

    console.log('  Seeding weather data...');
    const weatherCount = await seedWeather(biz.id);
    console.log(`  ✓ ${weatherCount} weather readings`);

    console.log('  Recalculating baselines...');
    const { rows: slots } = await pool.query(
      `SELECT EXTRACT(DOW FROM recorded_at)::int AS dow, EXTRACT(HOUR FROM recorded_at)::int AS hour,
              ROUND(AVG(reading_value), 2) AS avg, COUNT(*)::int AS samples
       FROM sensor_readings WHERE business_id = $1 AND device_type = 'people_counter'
         AND recorded_at >= NOW() - INTERVAL '56 days'
       GROUP BY dow, hour`,
      [biz.id]
    );
    for (const s of slots) {
      await pool.query(
        `INSERT INTO footfall_baselines (business_id, day_of_week, hour_slot, avg_footfall, sample_count, last_calculated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (business_id, day_of_week, hour_slot) DO UPDATE SET avg_footfall = $4, sample_count = $5, last_calculated_at = NOW()`,
        [biz.id, s.dow, s.hour, s.avg, s.samples]
      );
    }
    console.log(`  ✓ ${slots.length} baseline slots calculated`);

    console.log('\nDone! Summary:');
    console.log(`  Business: ${biz.name}`);
    console.log(`  Device: ${deviceSn}`);
    console.log(`  Zones: ${zonesCreated}`);
    console.log(`  Sensor readings: ${readingsInserted}`);
    console.log(`  Zone readings: ${zonesInserted}`);
    console.log(`  Weather readings: ${weatherCount}`);
    console.log(`  Baseline slots: ${slots.length}`);
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
