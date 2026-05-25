'use strict';

/**
 * h3.js — Thin wrapper around h3-js (v4 API) for the WiFi fingerprint
 * pipeline. Adds explicit input validation so callers get a clear TypeError
 * on bad input rather than a cryptic internal failure.
 *
 * Resolutions used:
 *   r8  — ~0.74 km² hexes (neighbourhood)
 *   r10 — ~0.015 km² hexes (block)
 *   r12 — ~0.0003 km² hexes (room-scale)
 */

const h3 = require('h3-js');

function isFiniteNumber(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

function isValidLat(lat) {
  return isFiniteNumber(lat) && lat >= -90 && lat <= 90;
}

function isValidLng(lng) {
  return isFiniteNumber(lng) && lng >= -180 && lng <= 180;
}

/**
 * Compute H3 indices at resolutions 8, 10 and 12 for a lat/lng pair.
 * Throws TypeError on invalid input.
 *
 * @param {number} lat  -90..90
 * @param {number} lng  -180..180
 * @returns {{ r8: string, r10: string, r12: string }}
 */
function getH3Indexes(lat, lng) {
  if (!isValidLat(lat)) {
    throw new TypeError('Invalid latitude: must be a finite number between -90 and 90');
  }
  if (!isValidLng(lng)) {
    throw new TypeError('Invalid longitude: must be a finite number between -180 and 180');
  }
  return {
    r8:  h3.latLngToCell(lat, lng, 8),
    r10: h3.latLngToCell(lat, lng, 10),
    r12: h3.latLngToCell(lat, lng, 12),
  };
}

/**
 * Return all hex indices within `radius` rings of `h3Index` (the centre
 * hex is included). Radius 0 → just the centre. Radius 1 → 7 hexes.
 *
 * @param {string} h3Index
 * @param {number} radius  non-negative integer
 * @returns {string[]}
 */
function getNeighbourHexes(h3Index, radius) {
  if (!isValidH3Index(h3Index)) {
    throw new TypeError('Invalid H3 index');
  }
  if (!Number.isInteger(radius) || radius < 0) {
    throw new TypeError('Invalid radius: must be a non-negative integer');
  }
  return h3.gridDisk(h3Index, radius);
}

/**
 * Return the centre lat/lng of an H3 hex.
 *
 * @param {string} h3Index
 * @returns {{ lat: number, lng: number }}
 */
function hexToLatLng(h3Index) {
  if (!isValidH3Index(h3Index)) {
    throw new TypeError('Invalid H3 index');
  }
  const [lat, lng] = h3.cellToLatLng(h3Index);
  return { lat, lng };
}

/**
 * Boolean check — never throws, returns false for anything that isn't a
 * recognisable H3 cell string.
 *
 * @param {any} h3Index
 * @returns {boolean}
 */
function isValidH3Index(h3Index) {
  if (typeof h3Index !== 'string' || h3Index.length === 0) return false;
  try {
    return h3.isValidCell(h3Index);
  } catch {
    return false;
  }
}

module.exports = { getH3Indexes, getNeighbourHexes, hexToLatLng, isValidH3Index };
