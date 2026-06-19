'use strict';

/**
 * signageVersions.js — single source of truth for the per-country
 * privacy-signage version a business needs to accept before
 * activating their first node.
 *
 * When a country's signage is updated:
 *   1. Drop the new file(s) into frontend-business/public/signage/
 *      using the same filename pattern <country>-<version>.<ext>.
 *   2. Bump the country's entry below — e.g. "v1" → "v2-2026-12".
 *   3. Deploy. The dashboard's Compliance page will detect that the
 *      business's last-accepted version is older than the current
 *      version and prompt them to re-accept on next node activation.
 *
 * The dashboard also serves the file URL from this module so the
 * frontend doesn't hard-code paths.
 *
 * PLACEHOLDER content currently — files in public/signage are
 * marked PLACEHOLDER until solicitor-reviewed PDFs / PNGs land.
 * The version string is what gets stored in
 * business_compliance_acceptances.signage_version, so once real
 * signage exists, bump the version so retroactive acceptances
 * are visibly distinguishable.
 */

const SIGNAGE = {
  // Ireland — EU GDPR + Irish DPC guidance
  IE: { version: 'v1-placeholder', filename: 'ie-v1.txt', label: 'Ireland (EU GDPR / Irish DPC)' },
  // United Kingdom — UK GDPR + ICO
  GB: { version: 'v1-placeholder', filename: 'gb-v1.txt', label: 'United Kingdom (UK GDPR / ICO)' },
  // United States — patchwork of state laws (CCPA, CPRA, VCDPA, ...). The
  // single placeholder file is the conservative position; if you go to
  // launch in California specifically you'd likely split into a CA file.
  US: { version: 'v1-placeholder', filename: 'us-v1.txt', label: 'United States (CCPA-aligned baseline)' },
  // Australia — Privacy Act 1988 + APP guidelines (OAIC)
  AU: { version: 'v1-placeholder', filename: 'au-v1.txt', label: 'Australia (Privacy Act / OAIC)' },
  // New Zealand — Privacy Act 2020 (OPC)
  NZ: { version: 'v1-placeholder', filename: 'nz-v1.txt', label: 'New Zealand (Privacy Act 2020 / OPC)' },
};

// Countries the business dashboard treats as "launch markets". A
// business with a country_code outside this set sees a generic
// fallback notice. As you expand to new countries, add an entry to
// SIGNAGE and they get the per-country flow automatically.
const LAUNCH_COUNTRIES = Object.keys(SIGNAGE);

function forCountry(code) {
  const k = (code || 'GB').toUpperCase();
  return SIGNAGE[k] || null;
}

// Public URL the dashboard fetches the sign from. The signage files
// live in frontend-business/public/signage/ which Vite copies to /
// at build time — so the dashboard serves them from its own origin
// (no CORS, no backend hop).
function publicUrlFor(code) {
  const entry = forCountry(code);
  if (!entry) return null;
  return `/signage/${entry.filename}`;
}

module.exports = {
  SIGNAGE,
  LAUNCH_COUNTRIES,
  forCountry,
  publicUrlFor,
};
