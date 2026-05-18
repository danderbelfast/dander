'use strict';

const path  = require('path');
const fs    = require('fs');
const sharp = require('sharp');
const axios = require('axios');

const LOGO_PATH = path.resolve(__dirname, '..', 'assets', 'Dander_Logo_White.png');
const CACHE_DIR = path.resolve(__dirname, '..', 'public', 'og');
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

const esc = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function renderText(markup, width) {
  return sharp({ text: { text: markup, rgba: true, width } }).png().toBuffer();
}

async function generateOgImage(offer, badge) {
  const cached = cachePath(offer.id);
  if (fs.existsSync(cached)) return fs.promises.readFile(cached);

  const bgBuffer = offer.image_url
    ? await fetchImageBuffer(offer.image_url).catch(() => null)
    : null;

  const bg = bgBuffer
    ? await sharp(bgBuffer).resize(WIDTH, HEIGHT, { fit: 'cover' }).toBuffer()
    : await sharp({ create: { width: WIDTH, height: HEIGHT, channels: 4, background: { r: 15, g: 14, b: 12, alpha: 1 } } }).png().toBuffer();

  const overlay = Buffer.from(
    `<svg width="${WIDTH}" height="${HEIGHT}">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="black" stop-opacity="0.1"/>
          <stop offset="40%" stop-color="black" stop-opacity="0.15"/>
          <stop offset="100%" stop-color="black" stop-opacity="0.82"/>
        </linearGradient>
      </defs>
      <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#g)"/>
      <rect x="0" y="${HEIGHT - 56}" width="${WIDTH}" height="56" fill="#E85D26"/>
    </svg>`
  );

  const title = (offer.title || '').length > 55
    ? offer.title.slice(0, 52) + '...'
    : (offer.title || '');
  const bizName = (offer.business_name || '').length > 45
    ? offer.business_name.slice(0, 42) + '...'
    : (offer.business_name || '');

  const composites = [{ input: overlay, top: 0, left: 0 }];

  if (badge) {
    const badgeBuf = await renderText(
      `<span foreground="#E85D26" font_weight="bold" font_size="42000">${esc(badge)}</span>`,
      WIDTH - 100
    );
    composites.push({ input: badgeBuf, top: 40, left: 50 });
  }

  const bizBuf = await renderText(
    `<span foreground="#cccccc" font_weight="bold" font_size="18000">${esc(bizName)}</span>`,
    WIDTH - 100
  );
  const titleBuf = await renderText(
    `<span foreground="#ffffff" font_weight="bold" font_size="32000">${esc(title)}</span>`,
    WIDTH - 100
  );

  const bizMeta  = await sharp(bizBuf).metadata();
  const titleMeta = await sharp(titleBuf).metadata();
  const blockH = (bizMeta.height || 24) + 8 + (titleMeta.height || 40);
  const textTop = HEIGHT - 56 - 30 - blockH;

  composites.push({ input: bizBuf, top: textTop, left: 50 });
  composites.push({ input: titleBuf, top: textTop + (bizMeta.height || 24) + 8, left: 50 });

  const ctaBuf = await renderText(
    `<span foreground="#ffffff" font_weight="bold" font_size="17000">dander.io  •  Deals near you</span>`,
    WIDTH - 80
  );
  const ctaMeta = await sharp(ctaBuf).metadata();
  composites.push({
    input: ctaBuf,
    top: HEIGHT - 56 + Math.round((56 - (ctaMeta.height || 20)) / 2),
    left: 50,
  });

  let logoBuf;
  try {
    logoBuf = await sharp(LOGO_PATH)
      .resize(120, null, { withoutEnlargement: true })
      .toBuffer();
  } catch { logoBuf = null; }

  if (logoBuf) {
    const logoMeta = await sharp(logoBuf).metadata();
    composites.push({
      input: logoBuf,
      top: HEIGHT - 56 + Math.round((56 - (logoMeta.height || 30)) / 2),
      left: WIDTH - 50 - (logoMeta.width || 120),
    });
  }

  const pngBuffer = await sharp(bg)
    .composite(composites)
    .png({ quality: 90 })
    .toBuffer();

  await fs.promises.writeFile(cached, pngBuffer).catch(() => {});

  return pngBuffer;
}

function invalidateCache(offerId) {
  const p = cachePath(offerId);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

module.exports = { generateOgImage, invalidateCache };
