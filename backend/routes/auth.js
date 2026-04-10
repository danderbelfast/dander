'use strict';

const { Router } = require('express');
const { body, validationResult } = require('express-validator');

const authService  = require('../services/authService');
const emailService = require('../services/emailService');
const { upload, processImage } = require('../middleware/upload');

const bizRegisterUpload = upload.fields([
  { name: 'logo',  maxCount: 1 },
  { name: 'cover', maxCount: 1 },
]);

const router = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ok(res, data, status = 200) {
  return res.status(status).json({ success: true, ...data });
}

function fail(res, status, code, message, details) {
  return res.status(status).json({ success: false, code, message, ...(details && { details }) });
}

function validate(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    fail(res, 400, 'VALIDATION_ERROR', 'Request validation failed.', errors.array());
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// POST /api/auth/register
// ---------------------------------------------------------------------------

router.post(
  '/register',
  [
    body('email').isEmail().normalizeEmail().withMessage('A valid email is required.'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters.')
      .matches(/[A-Z]/).withMessage('Password must contain an uppercase letter.')
      .matches(/[0-9]/).withMessage('Password must contain a number.'),
    body('firstName').notEmpty().trim().withMessage('First name is required.'),
    body('lastName').notEmpty().trim().withMessage('Last name is required.'),
    body('phone').optional().isMobilePhone().withMessage('Invalid phone number.'),
  ],
  async (req, res) => {
    if (!validate(req, res)) return;

    try {
      const { email, password, firstName, lastName, phone } = req.body;
      const result = await authService.registerUser(email, phone, password, firstName, lastName);

      return ok(res, {
        message: 'Account created. We\'ve sent a 6-digit verification code to your email.',
        userId:  result.userId,
      }, 201);
    } catch (err) {
      if (err.code === 'EMAIL_TAKEN') return fail(res, 409, err.code, err.message);
      console.error('[auth/register]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Registration failed. Please try again.');
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/auth/verify-2fa
// Verify email OTP after registration
// ---------------------------------------------------------------------------

router.post(
  '/verify-2fa',
  [
    body('userId').isInt({ min: 1 }).withMessage('userId is required.'),
    body('token').isLength({ min: 6, max: 6 }).isNumeric().withMessage('Code must be 6 digits.'),
  ],
  async (req, res) => {
    if (!validate(req, res)) return;

    try {
      const { userId, token } = req.body;
      await authService.verifyRegistrationOtp(userId, token);
      return ok(res, { message: 'Email verified. Your account is now active.' });
    } catch (err) {
      if (err.code === 'INVALID_OTP' || err.code === 'OTP_EXPIRED') return fail(res, 401, err.code, err.message);
      if (err.status === 404) return fail(res, 404, 'NOT_FOUND', err.message);
      console.error('[auth/verify-2fa]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Verification failed. Please try again.');
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/auth/resend-otp
// ---------------------------------------------------------------------------

router.post(
  '/resend-otp',
  [
    body('userId').isInt({ min: 1 }).withMessage('userId is required.'),
    body('purpose').isIn(['register', 'login', 'reset_password']).withMessage('Invalid purpose.'),
  ],
  async (req, res) => {
    if (!validate(req, res)) return;

    try {
      await authService.resendOtp(req.body.userId, req.body.purpose);
      return ok(res, { message: 'A new code has been sent to your email.' });
    } catch (err) {
      if (err.status === 404) return fail(res, 404, 'NOT_FOUND', err.message);
      console.error('[auth/resend-otp]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to resend code.');
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/auth/login  (step 1)
// ---------------------------------------------------------------------------

router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail().withMessage('A valid email is required.'),
    body('password').notEmpty().withMessage('Password is required.'),
  ],
  async (req, res) => {
    if (!validate(req, res)) return;

    try {
      const { email, password } = req.body;
      const result = await authService.loginUser(email, password);
      return ok(res, result);
    } catch (err) {
      if (err.status === 401) return fail(res, 401, err.code || 'INVALID_CREDENTIALS', err.message);
      if (err.status === 403) return fail(res, 403, err.code || 'ACCOUNT_INACTIVE', err.message);
      console.error('[auth/login]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Login failed. Please try again.');
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/auth/login/verify  (step 2 — complete login with email OTP)
// ---------------------------------------------------------------------------

router.post(
  '/login/verify',
  [
    body('tempToken').notEmpty().withMessage('tempToken is required.'),
    body('totpCode').isLength({ min: 6, max: 6 }).isNumeric().withMessage('Code must be 6 digits.'),
  ],
  async (req, res) => {
    if (!validate(req, res)) return;

    try {
      const { tempToken, totpCode } = req.body;
      const result = await authService.verifyLoginOtp(tempToken, totpCode);
      return ok(res, result);
    } catch (err) {
      if (err.status === 401) return fail(res, 401, err.code || 'AUTH_FAILED', err.message);
      console.error('[auth/login/verify]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Verification failed. Please try again.');
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/auth/refresh
// ---------------------------------------------------------------------------

router.post(
  '/refresh',
  [body('refreshToken').notEmpty().withMessage('refreshToken is required.')],
  async (req, res) => {
    if (!validate(req, res)) return;

    try {
      const result = await authService.refreshToken(req.body.refreshToken);
      return ok(res, result);
    } catch (err) {
      return fail(res, 401, 'INVALID_REFRESH_TOKEN', err.message);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/auth/business/register
// ---------------------------------------------------------------------------

router.post(
  '/business/register',
  bizRegisterUpload,
  [
    body('email').isEmail().normalizeEmail().withMessage('A valid email is required.'),
    body('password')
      .isLength({ min: 8 }).withMessage('Password must be at least 8 characters.')
      .matches(/[A-Z]/).withMessage('Password must contain an uppercase letter.')
      .matches(/[0-9]/).withMessage('Password must contain a number.'),
    body('firstName').notEmpty().trim().withMessage('First name is required.'),
    body('lastName').notEmpty().trim().withMessage('Last name is required.'),
    body('businessName').notEmpty().trim().withMessage('Business name is required.'),
    body('businessCategory').optional().trim(),
    body('city').optional().trim(),
    body('address').optional().trim(),
    body('lat').optional().isFloat({ min: -90,  max: 90  }).withMessage('Invalid latitude.'),
    body('lng').optional().isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude.'),
  ],
  async (req, res) => {
    if (!validate(req, res)) return;

    try {
      const {
        email, password, firstName, lastName, phone,
        businessName, businessCategory, address, city, lat, lng, website, businessPhone,
      } = req.body;

      const result = await authService.registerBusiness(
        { email, phone, password, firstName, lastName },
        {
          name:     businessName,
          category: businessCategory,
          address,
          city,
          lat:      lat != null ? parseFloat(lat) : null,
          lng:      lng != null ? parseFloat(lng) : null,
          website,
          phone:    businessPhone,
        }
      );

      // Process and save logo/cover images if provided
      const imageUpdates = {};
      if (req.files?.logo?.[0]) {
        imageUpdates.logo_url = await processImage(
          req.files.logo[0].buffer, 'logo', req.files.logo[0].originalname
        );
      }
      if (req.files?.cover?.[0]) {
        imageUpdates.cover_image_url = await processImage(
          req.files.cover[0].buffer, 'cover', req.files.cover[0].originalname
        );
      }
      if (Object.keys(imageUpdates).length > 0) {
        const pool = require('../db/pool');
        const setClauses = Object.keys(imageUpdates).map((col, i) => `${col} = $${i + 2}`);
        await pool.query(
          `UPDATE businesses SET ${setClauses.join(', ')} WHERE id = $1`,
          [result.businessId, ...Object.values(imageUpdates)]
        );
      }

      // Notify admin of new application (non-fatal)
      emailService.sendNewBusinessAlert({
        businessName,
        ownerName:  `${firstName} ${lastName}`,
        ownerEmail: email,
      }).catch(() => {});

      return ok(res, {
        message:    'Business account created. We\'ve sent a 6-digit verification code to your email.',
        userId:     result.userId,
        businessId: result.businessId,
      }, 201);
    } catch (err) {
      if (err.code === 'EMAIL_TAKEN') return fail(res, 409, err.code, err.message);
      console.error('[auth/business/register]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Registration failed. Please try again.');
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/auth/forgot-password
// ---------------------------------------------------------------------------

router.post(
  '/forgot-password',
  [body('email').isEmail().normalizeEmail().withMessage('A valid email is required.')],
  async (req, res) => {
    if (!validate(req, res)) return;
    try {
      const result = await authService.requestPasswordReset(req.body.email);
      return ok(res, { message: 'A 6-digit reset code has been sent to your email.', userId: result.userId });
    } catch (err) {
      if (err.code === 'EMAIL_NOT_FOUND') return fail(res, 404, err.code, err.message);
      if (err.status === 403)             return fail(res, 403, 'ACCOUNT_INACTIVE', err.message);
      console.error('[auth/forgot-password]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to send reset code. Please try again.');
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/auth/reset-password
// ---------------------------------------------------------------------------

router.post(
  '/reset-password',
  [
    body('userId').isInt({ min: 1 }).withMessage('userId is required.'),
    body('code').isLength({ min: 6, max: 6 }).isNumeric().withMessage('Code must be 6 digits.'),
    body('newPassword')
      .isLength({ min: 8 }).withMessage('Password must be at least 8 characters.')
      .matches(/[A-Z]/).withMessage('Password must contain an uppercase letter.')
      .matches(/[0-9]/).withMessage('Password must contain a number.'),
  ],
  async (req, res) => {
    if (!validate(req, res)) return;
    try {
      const { userId, code, newPassword } = req.body;
      await authService.resetPassword(userId, code, newPassword);
      return ok(res, { message: 'Password updated. You can now sign in with your new password.' });
    } catch (err) {
      if (err.code === 'INVALID_OTP' || err.code === 'OTP_EXPIRED') return fail(res, 401, err.code, err.message);
      if (err.status === 404) return fail(res, 404, 'NOT_FOUND', err.message);
      console.error('[auth/reset-password]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Password reset failed. Please try again.');
    }
  }
);

module.exports = router;
