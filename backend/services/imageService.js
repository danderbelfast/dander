'use strict';

/**
 * imageService.js
 *
 * Handles image resize + upload with a clean strategy pattern:
 *   - If CLOUDINARY_URL is set → upload to Cloudinary CDN
 *   - Otherwise              → write to local /uploads/ (dev fallback)
 *
 * All images are pre-processed by sharp before upload:
 *   • Resize to the preset dimensions (never upscale)
 *   • Convert to WebP at quality 82
 *   • Strip EXIF metadata
 *
 * Usage in route handlers:
 *   const { processAndStore } = require('../services/imageService');
 *   const url = await processAndStore(file.buffer, 'logo', file.originalname);
 *
 * Environment variables:
 *   CLOUDINARY_URL — full connection string, e.g.
 *                    cloudinary://api_key:api_secret@cloud_name
 *                    (set this to enable Cloudinary; omit for local storage)
 */

const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');
const sharp  = require('sharp');
const { Readable } = require('stream');

// ---------------------------------------------------------------------------
// Image presets
// ---------------------------------------------------------------------------

const PRESETS = {
  logo:   { width: 400,  height: 400,  fit: 'cover',  quality: 85 },
  cover:  { width: 1200, height: 400,  fit: 'cover',  quality: 82 },
  offer:  { width: 900,  height: 600,  fit: 'inside', quality: 82 },
  avatar: { width: 200,  height: 200,  fit: 'cover',  quality: 88 },
};

// ---------------------------------------------------------------------------
// Sharp — resize + convert to WebP
// ---------------------------------------------------------------------------

/**
 * Resize and optimise a raw image buffer.
 *
 * @param {Buffer} buffer      — raw file buffer from multer
 * @param {string} preset      — 'logo' | 'cover' | 'offer' | 'avatar'
 * @returns {Promise<Buffer>}  — optimised WebP buffer
 */
async function optimise(buffer, preset) {
  const { width, height, fit, quality } = PRESETS[preset] || PRESETS.offer;

  return sharp(buffer)
    .rotate()                               // auto-orient from EXIF
    .resize(width, height, { fit, withoutEnlargement: true })
    .webp({ quality })
    .toBuffer();
}

// ---------------------------------------------------------------------------
// Cloudinary upload
// ---------------------------------------------------------------------------

let _cloudinary = null;

function getCloudinary() {
  if (_cloudinary) return _cloudinary;
  const url = process.env.CLOUDINARY_URL;
  if (!url) throw new Error('CLOUDINARY_URL is not set.');
  // Lazy-require to avoid import errors when running without the package
  const { v2: cloudinary } = require('cloudinary');
  cloudinary.config({ cloudinary_url: url });
  _cloudinary = cloudinary;
  return _cloudinary;
}

/**
 * Upload a buffer to Cloudinary.
 *
 * @param {Buffer} buffer
 * @param {string} folder   — Cloudinary folder, e.g. 'dander/logos'
 * @param {string} publicId — optional stable public ID (enables cache-bust)
 * @returns {Promise<string>} — secure CDN URL
 */
function uploadToCloudinary(buffer, folder, publicId) {
  return new Promise((resolve, reject) => {
    const cloudinary = getCloudinary();
    const opts = {
      folder,
      resource_type: 'image',
      format: 'webp',
      overwrite: true,
    };
    if (publicId) opts.public_id = publicId;

    const stream = cloudinary.uploader.upload_stream(opts, (err, result) => {
      if (err) return reject(err);
      resolve(result.secure_url);
    });

    // Pipe buffer into the upload stream
    const readable = new Readable();
    readable.push(buffer);
    readable.push(null);
    readable.pipe(stream);
  });
}

// ---------------------------------------------------------------------------
// Local fallback (development / self-hosted)
// ---------------------------------------------------------------------------

const UPLOAD_DIR = path.resolve(__dirname, '..', 'uploads');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/**
 * Save a buffer to disk and return a local URL path.
 *
 * @param {Buffer} buffer
 * @param {string} [name]  — original filename (used to build output name)
 * @returns {Promise<string>} — e.g. /uploads/1720000000-abc123.webp
 */
async function saveLocal(buffer, name) {
  const base     = path.basename(name || 'upload', path.extname(name || ''));
  const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}-${base}.webp`;
  const filepath = path.join(UPLOAD_DIR, filename);
  await fs.promises.writeFile(filepath, buffer);
  return `/uploads/${filename}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Optimise an image and store it — Cloudinary in production, local disk in dev.
 *
 * @param {Buffer} buffer          — raw buffer from multer
 * @param {string} preset          — 'logo' | 'cover' | 'offer' | 'avatar'
 * @param {string} [originalName]  — original filename
 * @param {object} [opts]
 * @param {string} [opts.folder]   — Cloudinary sub-folder (default: 'dander/<preset>s')
 * @param {string} [opts.publicId] — stable public ID for overwrite (e.g. 'biz_42_logo')
 * @returns {Promise<string>}      — public URL (CDN or local path)
 */
async function processAndStore(buffer, preset, originalName, opts = {}) {
  // 1. Resize + convert
  const webpBuffer = await optimise(buffer, preset);

  // 2. Store
  if (process.env.CLOUDINARY_URL) {
    const folder   = opts.folder   || `dander/${preset}s`;
    const publicId = opts.publicId || undefined;
    try {
      return await uploadToCloudinary(webpBuffer, folder, publicId);
    } catch (err) {
      console.error('[imageService] Cloudinary upload failed, falling back to local:', err.message);
      // Fall through to local on Cloudinary error
    }
  }

  return saveLocal(webpBuffer, originalName);
}

/**
 * Delete an image from Cloudinary by its public ID.
 * No-op when running locally (public IDs aren't tracked for local files).
 *
 * @param {string} publicId — the Cloudinary public_id to destroy
 */
async function deleteImage(publicId) {
  if (!publicId || !process.env.CLOUDINARY_URL) return;
  try {
    const cloudinary = getCloudinary();
    await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    console.error('[imageService] Cloudinary delete failed:', err.message);
  }
}

module.exports = {
  processAndStore,
  deleteImage,
  optimise,      // exposed for testing / reuse
};
