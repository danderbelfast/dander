'use strict';

const path  = require('path');
const fs    = require('fs');
const sharp = require('sharp');
const axios = require('axios');

const LOGO_PATH = path.resolve(__dirname, '..', 'assets', 'Dander_Logo_White.png');
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

async function generateShareImage(offer) {
  const bgBuffer = offer.image_url
    ? await fetchImageBuffer(offer.image_url)
    : null;

  const bg = bgBuffer
    ? await sharp(bgBuffer).resize(WIDTH, HEIGHT, { fit: 'cover' }).toBuffer()
    : await sharp({ create: { width: WIDTH, height: HEIGHT, channels: 4, background: { r: 15, g: 14, b: 12, alpha: 1 } } }).png().toBuffer();

  const darkOverlay = Buffer.from(
    `<svg width="${WIDTH}" height="${HEIGHT}">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="black" stop-opacity="0.15"/>
          <stop offset="55%" stop-color="black" stop-opacity="0.1"/>
          <stop offset="100%" stop-color="black" stop-opacity="0.85"/>
        </linearGradient>
      </defs>
      <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#g)"/>
    </svg>`
  );

  const title = (offer.title || '').length > 50
    ? offer.title.slice(0, 47) + '...'
    : (offer.title || '');
  const bizName = (offer.business_name || '').length > 40
    ? offer.business_name.slice(0, 37) + '...'
    : (offer.business_name || '');

  let discountText = '';
  if (offer.discount_percent) discountText = `${Math.round(offer.discount_percent)}% OFF`;
  else if (offer.offer_price != null) discountText = `£${parseFloat(offer.offer_price).toFixed(2)}`;

  const escXml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const textOverlay = Buffer.from(
    `<svg width="${WIDTH}" height="${HEIGHT}">
      <style>
        .biz  { font: bold 28px sans-serif; fill: rgba(255,255,255,0.8); }
        .title { font: bold 48px sans-serif; fill: #fff; }
        .disc { font: 800 64px sans-serif; fill: #E85D26; }
        .cta  { font: 600 26px sans-serif; fill: rgba(255,255,255,0.9); }
        .cta-bg { fill: #E85D26; }
      </style>

      ${discountText ? `<text x="60" y="120" class="disc">${escXml(discountText)}</text>` : ''}

      <text x="60" y="${HEIGHT - 195}" class="biz">${escXml(bizName)}</text>
      <text x="60" y="${HEIGHT - 145}" class="title">${escXml(title)}</text>

      <rect x="0" y="${HEIGHT - 90}" width="${WIDTH}" height="90" class="cta-bg"/>
      <text x="${WIDTH / 2}" y="${HEIGHT - 38}" text-anchor="middle" class="cta">Find this deal on Dander</text>
    </svg>`
  );

  let logoBuf;
  try {
    logoBuf = await sharp(LOGO_PATH)
      .resize(140, null, { withoutEnlargement: true })
      .toBuffer();
  } catch {
    logoBuf = null;
  }

  const composites = [
    { input: darkOverlay, top: 0, left: 0 },
    { input: textOverlay, top: 0, left: 0 },
  ];

  if (logoBuf) {
    composites.push({ input: logoBuf, top: 30, left: WIDTH - 180 });
  }

  return sharp(bg)
    .composite(composites)
    .png({ quality: 90 })
    .toBuffer();
}

module.exports = { generateShareImage };
