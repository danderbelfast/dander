'use strict';

const path  = require('path');
const fs    = require('fs');
const sharp = require('sharp');
const axios = require('axios');
const { Resvg } = require('@resvg/resvg-js');

const LOGO_PATH = path.resolve(__dirname, '..', 'assets', 'TapProve_Logo_White.png');
const WIDTH  = 1080;
const HEIGHT = 1080;

async function fetchImageBuffer(url) {
  if (url.startsWith('/uploads/')) {
    const local = path.resolve(__dirname, '..', url.replace(/^\//, ''));
    return fs.promises.readFile(local);
  }
  const { data } = await axios.get(url, { responseType: 'arraybuffer', timeout: 10000 });
  return Buffer.from(data);
}

const esc = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function toBase64DataUri(buffer, mime) {
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

async function generateShareImage(offer) {
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
    const logoBuf = await sharp(LOGO_PATH).resize(140, null, { withoutEnlargement: true }).png().toBuffer();
    logoDataUri = await toBase64DataUri(logoBuf, 'image/png');
  } catch {}

  const title = (offer.title || '').length > 50 ? offer.title.slice(0, 47) + '...' : (offer.title || '');
  const bizName = (offer.business_name || '').length > 40 ? offer.business_name.slice(0, 37) + '...' : (offer.business_name || '');

  let discountText = '';
  if (offer.discount_percent) discountText = `${Math.round(offer.discount_percent)}% OFF`;
  else if (offer.offer_price != null) discountText = `£${parseFloat(offer.offer_price).toFixed(2)}`;

  const svg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#000" stop-opacity="0.15"/>
      <stop offset="55%" stop-color="#000" stop-opacity="0.1"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.85"/>
    </linearGradient>
  </defs>

  ${bgDataUri
    ? `<image href="${bgDataUri}" width="${WIDTH}" height="${HEIGHT}" preserveAspectRatio="xMidYMid slice"/>`
    : `<rect width="${WIDTH}" height="${HEIGHT}" fill="#0F0E0C"/>`}

  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#g)"/>

  <!-- CTA bar -->
  <rect x="0" y="${HEIGHT - 90}" width="${WIDTH}" height="90" fill="#E85D26"/>

  ${discountText ? `<text x="60" y="110" font-family="sans-serif" font-size="58" font-weight="800" fill="#E85D26">${esc(discountText)}</text>` : ''}

  <text x="60" y="${HEIGHT - 175}" font-family="sans-serif" font-size="26" font-weight="bold" fill="#ccc">${esc(bizName)}</text>
  <text x="60" y="${HEIGHT - 130}" font-family="sans-serif" font-size="44" font-weight="bold" fill="#fff">${esc(title)}</text>

  <text x="${WIDTH / 2}" y="${HEIGHT - 35}" font-family="sans-serif" font-size="24" font-weight="bold" fill="#fff" text-anchor="middle">Find this deal on TapProve</text>

  ${logoDataUri ? `<image href="${logoDataUri}" x="${WIDTH - 180}" y="30" width="140" height="35" preserveAspectRatio="xMidYMid meet"/>` : ''}
</svg>`;

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: WIDTH },
  });
  const rawPng = resvg.render().asPng();
  return sharp(Buffer.from(rawPng))
    .png({ compressionLevel: 9, colours: 64, palette: true, effort: 10 })
    .toBuffer();
}

module.exports = { generateShareImage };
