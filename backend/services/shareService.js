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

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function renderText(markup, width) {
  return sharp({
    text: {
      text: markup,
      rgba: true,
      width,
    },
  }).png().toBuffer();
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

  const ctaBar = Buffer.from(
    `<svg width="${WIDTH}" height="90">
      <rect width="${WIDTH}" height="90" fill="#E85D26"/>
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

  const composites = [
    { input: darkOverlay, top: 0, left: 0 },
    { input: ctaBar, top: HEIGHT - 90, left: 0 },
  ];

  if (discountText) {
    const discBuf = await renderText(
      `<span foreground="#E85D26" font_weight="bold" font_size="52000">${esc(discountText)}</span>`,
      WIDTH - 120
    );
    composites.push({ input: discBuf, top: 60, left: 60 });
  }

  const bizBuf = await renderText(
    `<span foreground="#cccccc" font_weight="bold" font_size="22000">${esc(bizName)}</span>`,
    WIDTH - 120
  );
  const titleBuf = await renderText(
    `<span foreground="#ffffff" font_weight="bold" font_size="38000">${esc(title)}</span>`,
    WIDTH - 120
  );

  const bizMeta = await sharp(bizBuf).metadata();
  const titleMeta = await sharp(titleBuf).metadata();
  const textBlockH = (bizMeta.height || 30) + 10 + (titleMeta.height || 50);
  const textTop = HEIGHT - 90 - 40 - textBlockH;

  composites.push({ input: bizBuf, top: textTop, left: 60 });
  composites.push({ input: titleBuf, top: textTop + (bizMeta.height || 30) + 10, left: 60 });

  const ctaTextBuf = await renderText(
    `<span foreground="#ffffff" font_weight="bold" font_size="21000">Find this deal on Dander</span>`,
    WIDTH - 60
  );
  const ctaMeta = await sharp(ctaTextBuf).metadata();
  composites.push({
    input: ctaTextBuf,
    top: HEIGHT - 90 + Math.round((90 - (ctaMeta.height || 26)) / 2),
    left: Math.round((WIDTH - (ctaMeta.width || 400)) / 2),
  });

  let logoBuf;
  try {
    logoBuf = await sharp(LOGO_PATH)
      .resize(140, null, { withoutEnlargement: true })
      .toBuffer();
  } catch {
    logoBuf = null;
  }
  if (logoBuf) {
    composites.push({ input: logoBuf, top: 30, left: WIDTH - 180 });
  }

  return sharp(bg)
    .composite(composites)
    .png({ quality: 90 })
    .toBuffer();
}

module.exports = { generateShareImage };
