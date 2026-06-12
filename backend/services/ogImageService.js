'use strict';

const path  = require('path');
const fs    = require('fs');
const sharp = require('sharp');
const axios = require('axios');
const { Resvg } = require('@resvg/resvg-js');

const LOGO_PATH = path.resolve(__dirname, '..', 'assets', 'TapProve_Logo_White.png');
const CACHE_DIR = path.resolve(process.env.OG_IMAGE_CACHE_DIR || path.join(__dirname, '..', 'public', 'og'));
const WIDTH  = 1200;
const HEIGHT = 630;

if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

function cachePath(offerId) {
  return path.join(CACHE_DIR, `${offerId}.png`);
}

async function fetchImageBuffer(url) {
  if (url.startsWith('/uploads/')) {
    return fs.promises.readFile(path.resolve(__dirname, '..', url.replace(/^\//, '')));
  }
  const { data } = await axios.get(url, { responseType: 'arraybuffer', timeout: 10000 });
  return Buffer.from(data);
}

const esc = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function toBase64DataUri(buffer, mime) {
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

async function generateOgImage(offer, badge) {
  const cached = cachePath(offer.id);
  if (fs.existsSync(cached)) return fs.promises.readFile(cached);

  let bgDataUri = '';
  if (offer.image_url) {
    try {
      const raw = await fetchImageBuffer(offer.image_url);
      const resized = await sharp(raw).resize(WIDTH, HEIGHT, { fit: 'cover' }).jpeg({ quality: 60 }).toBuffer();
      bgDataUri = await toBase64DataUri(resized, 'image/jpeg');
    } catch {}
  }

  let logoDataUri = '';
  try {
    const logoBuf = await sharp(LOGO_PATH).resize(120, null, { withoutEnlargement: true }).png().toBuffer();
    logoDataUri = await toBase64DataUri(logoBuf, 'image/png');
  } catch {}

  const title = (offer.title || '').length > 55 ? offer.title.slice(0, 52) + '...' : (offer.title || '');
  const bizName = (offer.business_name || '').length > 45 ? offer.business_name.slice(0, 42) + '...' : (offer.business_name || '');

  const svg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#000" stop-opacity="0.1"/>
      <stop offset="40%" stop-color="#000" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.82"/>
    </linearGradient>
  </defs>

  ${bgDataUri
    ? `<image href="${bgDataUri}" width="${WIDTH}" height="${HEIGHT}" preserveAspectRatio="xMidYMid slice"/>`
    : `<rect width="${WIDTH}" height="${HEIGHT}" fill="#0F0E0C"/>`}

  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#g)"/>

  <!-- CTA bar -->
  <rect x="0" y="${HEIGHT - 56}" width="${WIDTH}" height="56" fill="#E85D26"/>

  ${badge ? `<text x="50" y="75" font-family="sans-serif" font-size="48" font-weight="bold" fill="#E85D26">${esc(badge)}</text>` : ''}

  <text x="50" y="${HEIGHT - 120}" font-family="sans-serif" font-size="22" font-weight="bold" fill="#ccc">${esc(bizName)}</text>
  <text x="50" y="${HEIGHT - 82}" font-family="sans-serif" font-size="36" font-weight="bold" fill="#fff">${esc(title)}</text>

  <text x="50" y="${HEIGHT - 20}" font-family="sans-serif" font-size="20" font-weight="bold" fill="#fff">tapprove.io  ·  Proven by presence</text>

  ${logoDataUri ? `<image href="${logoDataUri}" x="${WIDTH - 170}" y="${HEIGHT - 50}" width="120" height="30" preserveAspectRatio="xMidYMid meet"/>` : ''}
</svg>`;

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: WIDTH },
  });
  const rawPng = resvg.render().asPng();
  const pngBuffer = await sharp(Buffer.from(rawPng))
    .png({ compressionLevel: 9, colours: 64, palette: true, effort: 10 })
    .toBuffer();

  await fs.promises.writeFile(cached, pngBuffer).catch(() => {});

  return pngBuffer;
}

function invalidateCache(offerId) {
  const p = cachePath(offerId);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

module.exports = { generateOgImage, invalidateCache };
