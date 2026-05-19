'use strict';

const pool = require('../db/pool');

async function generateDailyInsights(businessId, date) {
  const dateStr = date || new Date().toISOString().slice(0, 10);
  const dow = new Date(dateStr).getDay();

  // 1. Get footfall for the target date
  const { rows: footfallRows } = await pool.query(
    `SELECT
       EXTRACT(HOUR FROM recorded_at)::int AS hour,
       AVG(reading_value)::numeric(10,1) AS avg_count,
       COUNT(*)::int AS readings
     FROM sensor_readings
     WHERE business_id = $1
       AND device_type = 'people_counter'
       AND DATE(recorded_at) = $2
     GROUP BY hour ORDER BY hour`,
    [businessId, dateStr]
  );

  if (footfallRows.length === 0) {
    return { date: dateStr, insights: [], summary: 'No footfall data for this date.' };
  }

  const totalFootfall = footfallRows.reduce((sum, r) => sum + parseFloat(r.avg_count), 0);
  const avgHourly = totalFootfall / footfallRows.length;

  // 2. Get baseline for this day of week
  const { rows: baselineRows } = await pool.query(
    `SELECT hour_slot, avg_footfall FROM footfall_baselines
     WHERE business_id = $1 AND day_of_week = $2
     ORDER BY hour_slot`,
    [businessId, dow]
  );

  const baselineMap = {};
  let baselineTotal = 0;
  for (const b of baselineRows) {
    baselineMap[b.hour_slot] = parseFloat(b.avg_footfall);
    baselineTotal += parseFloat(b.avg_footfall);
  }
  const baselineAvgHourly = baselineRows.length > 0 ? baselineTotal / baselineRows.length : null;

  // 3. Get weather for the date
  const { rows: weatherRows } = await pool.query(
    `SELECT temperature_c, wind_speed_kmh, rainfall_mm, condition
     FROM weather_readings
     WHERE business_id = $1 AND DATE(recorded_at) = $2
     ORDER BY recorded_at`,
    [businessId, dateStr]
  );

  const avgTemp = weatherRows.length > 0
    ? weatherRows.reduce((s, w) => s + parseFloat(w.temperature_c || 0), 0) / weatherRows.length
    : null;
  const totalRain = weatherRows.reduce((s, w) => s + parseFloat(w.rainfall_mm || 0), 0);
  const avgWind = weatherRows.length > 0
    ? weatherRows.reduce((s, w) => s + parseFloat(w.wind_speed_kmh || 0), 0) / weatherRows.length
    : null;
  const conditions = [...new Set(weatherRows.map(w => w.condition).filter(Boolean))];
  const isRainy = totalRain > 2 || conditions.some(c => /rain|shower|drizzle/i.test(c));
  const isWarm = avgTemp != null && avgTemp > 20;
  const isCold = avgTemp != null && avgTemp < 5;

  // 4. Get offers fired that day
  const { rows: offersToday } = await pool.query(
    `SELECT id, title, created_at, current_redemptions
     FROM offers
     WHERE business_id = $1 AND DATE(created_at) = $2 AND is_active = true
     ORDER BY created_at`,
    [businessId, dateStr]
  );

  // 5. Check footfall uplift after offers (within 90 min)
  const offerUplifts = [];
  for (const offer of offersToday) {
    const offerHour = new Date(offer.created_at).getHours();
    const { rows: postOffer } = await pool.query(
      `SELECT AVG(reading_value)::numeric(10,1) AS avg_after
       FROM sensor_readings
       WHERE business_id = $1 AND device_type = 'people_counter'
         AND recorded_at BETWEEN $2 AND $2 + INTERVAL '90 minutes'`,
      [businessId, offer.created_at]
    );
    const baseline = baselineMap[offerHour] || null;
    const afterAvg = postOffer[0]?.avg_after ? parseFloat(postOffer[0].avg_after) : null;
    if (afterAvg != null && baseline != null && afterAvg > baseline) {
      offerUplifts.push({
        offer_id: offer.id,
        title: offer.title,
        hour: offerHour,
        uplift: parseFloat((afterAvg - baseline).toFixed(1)),
      });
    }
  }

  // 6. Network average for similar businesses on this DOW
  const { rows: networkRows } = await pool.query(
    `SELECT AVG(fb.avg_footfall)::numeric(10,1) AS network_avg
     FROM footfall_baselines fb
     JOIN businesses b ON b.id = fb.business_id
     WHERE fb.day_of_week = $1 AND fb.business_id != $2`,
    [dow, businessId]
  );
  const networkAvg = networkRows[0]?.network_avg ? parseFloat(networkRows[0].network_avg) : null;

  // 7. Generate insights
  const insights = [];
  const footfallUp = baselineAvgHourly != null && avgHourly > baselineAvgHourly * 1.15;
  const footfallDown = baselineAvgHourly != null && avgHourly < baselineAvgHourly * 0.85;

  // Rain + footfall up
  if (isRainy && footfallUp) {
    insights.push({
      type: 'weather_positive',
      description: `Rain on ${formatDay(dateStr)} likely drove more indoor visitors`,
      confidence: 'high',
      data: { rainfall_mm: totalRain, footfall_change_pct: deviationPct(avgHourly, baselineAvgHourly) },
    });
  }

  // Rain + footfall down
  if (isRainy && footfallDown) {
    insights.push({
      type: 'weather_negative',
      description: `Rain on ${formatDay(dateStr)} may have kept customers away`,
      confidence: 'medium',
      data: { rainfall_mm: totalRain, footfall_change_pct: deviationPct(avgHourly, baselineAvgHourly) },
    });
  }

  // Warm + footfall down
  if (isWarm && !isRainy && footfallDown) {
    insights.push({
      type: 'weather_negative',
      description: `Warm weather on ${formatDay(dateStr)} may have kept customers outside`,
      confidence: 'medium',
      data: { temperature_c: round1(avgTemp), footfall_change_pct: deviationPct(avgHourly, baselineAvgHourly) },
    });
  }

  // Cold + footfall up
  if (isCold && footfallUp) {
    insights.push({
      type: 'weather_positive',
      description: `Cold weather on ${formatDay(dateStr)} likely drove more visitors indoors`,
      confidence: 'medium',
      data: { temperature_c: round1(avgTemp), footfall_change_pct: deviationPct(avgHourly, baselineAvgHourly) },
    });
  }

  // Offer-driven uplift
  for (const u of offerUplifts) {
    insights.push({
      type: 'offer_impact',
      description: `Your Dander offer at ${u.hour}:00 drove an estimated ${u.uplift} extra visitors`,
      confidence: 'high',
      data: { offer_id: u.offer_id, offer_title: u.title, uplift: u.uplift },
    });
  }

  // Below network average with no specific cause
  if (footfallDown && insights.length === 0 && networkAvg != null && avgHourly < networkAvg * 0.85) {
    insights.push({
      type: 'below_network',
      description: 'Footfall was below average for similar businesses in your area — no specific cause identified',
      confidence: 'low',
      data: { your_avg: round1(avgHourly), network_avg: parseFloat(networkAvg) },
    });
  }

  // Above baseline general
  if (footfallUp && insights.length === 0) {
    insights.push({
      type: 'above_baseline',
      description: `Footfall on ${formatDay(dateStr)} was ${deviationPct(avgHourly, baselineAvgHourly)}% above your baseline`,
      confidence: 'medium',
      data: { your_avg: round1(avgHourly), baseline_avg: round1(baselineAvgHourly) },
    });
  }

  return {
    date: dateStr,
    footfall: {
      total: round1(totalFootfall),
      avg_hourly: round1(avgHourly),
      baseline_avg_hourly: baselineAvgHourly != null ? round1(baselineAvgHourly) : null,
      deviation_pct: baselineAvgHourly != null ? deviationPct(avgHourly, baselineAvgHourly) : null,
      hours_tracked: footfallRows.length,
    },
    weather: weatherRows.length > 0 ? {
      avg_temperature_c: round1(avgTemp),
      total_rainfall_mm: round1(totalRain),
      avg_wind_speed_kmh: round1(avgWind),
      conditions,
    } : null,
    offers_fired: offersToday.length,
    insights,
  };
}

function formatDay(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-GB', { weekday: 'long' });
}

function round1(n) {
  return n != null ? parseFloat(n.toFixed(1)) : null;
}

function deviationPct(current, baseline) {
  if (!baseline || baseline === 0) return 0;
  return parseFloat((((current - baseline) / baseline) * 100).toFixed(1));
}

module.exports = { generateDailyInsights };
