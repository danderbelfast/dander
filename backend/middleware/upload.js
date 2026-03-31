'use strict';

/**
 * upload.js — Multer middleware + image processing
 *
 * Provides the multer instance for route handlers and a processImage()
 * helper that now delegates to imageService for resize + storage.
 *
 * Storage strategy (automatic, no code change needed):
 *   CLOUDINARY_URL set → Cloudinary CDN (production)
 *   CLOUDINARY_URL unset → local /uploads/ directory (development)
 */

const multer       = require('multer');
const imageService = require('../services/imageService');

// ---------------------------------------------------------------------------
// Multer — memory storage, 5 MB cap, images only
// ---------------------------------------------------------------------------

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(Object.assign(new Error('Only image files are accepted.'), { status: 400 }));
    }
  },
});

// ---------------------------------------------------------------------------
// processImage — thin wrapper around imageService.processAndStore
// ---------------------------------------------------------------------------

/**
 * Resize, optimise, and store an uploaded image.
 *
 * @param {Buffer} buffer        — raw buffer from req.file.buffer
 * @param {string} preset        — 'logo' | 'cover' | 'offer' | 'avatar'
 * @param {string} [originalName]
 * @param {object} [opts]        — passed through to imageService (folder, publicId)
 * @returns {Promise<string>}    — public URL (CDN or /uploads/…)
 */
async function processImage(buffer, preset, originalName, opts) {
  return imageService.processAndStore(buffer, preset, originalName, opts);
}

module.exports = {
  upload,
  processImage,
};
