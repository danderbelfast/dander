require('dotenv').config();

const path    = require('path');
const express = require('express');

// Run DB migrations before anything else (idempotent — safe on every start)
require('../db/migrate')().catch((err) => {
  console.error('[startup] Migration failed:', err.message);
  process.exit(1);
});
const cors    = require('cors');
const helmet  = require('helmet');
const morgan  = require('morgan');
const rateLimit = require('express-rate-limit');
const { createServer } = require('http');
const { Server }       = require('socket.io');

// ---------------------------------------------------------------------------
// App + HTTP server
// ---------------------------------------------------------------------------

const app        = express();
app.set('trust proxy', true); // trust all proxy hops (Railway uses multiple)
const httpServer = createServer(app);
const io         = new Server(httpServer, {
  cors: {
    origin:  process.env.FRONTEND_URL || '*',
    methods: ['GET', 'POST'],
  },
});

// Make io available to route handlers via req.app.get('io')
app.set('io', io);

// ---------------------------------------------------------------------------
// Security & logging middleware
// ---------------------------------------------------------------------------

app.use(helmet({
  // Allow serving local /uploads images inline
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map((o) => o.trim())
  : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002'];
app.use(cors({ origin: allowedOrigins }));
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---------------------------------------------------------------------------
// Static file serving
//   Development  — serve /uploads locally (Cloudinary not configured)
//   Production   — serve built frontend bundles from each package's dist/
//                  (Cloudinary handles images; set CLOUDINARY_URL in env)
// ---------------------------------------------------------------------------

app.use('/uploads', express.static(path.resolve(__dirname, '..', 'uploads')));

if (process.env.NODE_ENV === 'production') {
  const distPaths = [
    { route: '/app',   dir: path.resolve(__dirname, '../../frontend-user/dist') },
    { route: '/biz',   dir: path.resolve(__dirname, '../../frontend-business/dist') },
    { route: '/admin', dir: path.resolve(__dirname, '../../frontend-admin/dist') },
  ];
  distPaths.forEach(({ route, dir }) => {
    if (require('fs').existsSync(dir)) {
      app.use(route, express.static(dir));
      app.get(`${route}/*`, (_req, res) =>
        res.sendFile(path.join(dir, 'index.html'))
      );
    }
  });
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

const authLimiter = rateLimit({
  windowMs:         60 * 1000,   // 1 minute
  max:              20,
  standardHeaders:  true,
  legacyHeaders:    false,
  message:          { success: false, code: 'RATE_LIMITED', message: 'Too many requests. Please wait a minute and try again.' },
});

const generalLimiter = rateLimit({
  windowMs:         60 * 1000,   // 1 minute
  max:              300,
  standardHeaders:  true,
  legacyHeaders:    false,
  message:          { success: false, code: 'RATE_LIMITED', message: 'Too many requests. Please slow down.' },
});

// Apply general limiter to all routes, then tighten on auth
app.use(generalLimiter);
app.use('/api/auth', authLimiter);

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.use('/api/auth',        require('../routes/auth'));
app.use('/api/offers',      require('../routes/offers'));
app.use('/api/coupons',     require('../routes/coupons'));
app.use('/api/business',    require('../routes/business'));
app.use('/api/admin',       require('../routes/admin'));
app.use('/api/push',        require('../routes/push'));
app.use('/api/users',       require('../routes/users'));
app.use('/api/preferences', require('../routes/preferences'));

// ---------------------------------------------------------------------------
// Health check  (exempt from auth; after routes so it doesn't interfere)
// ---------------------------------------------------------------------------

app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ---------------------------------------------------------------------------
// 404 handler
// ---------------------------------------------------------------------------

app.use((_req, res) => {
  res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Route not found.' });
});

// ---------------------------------------------------------------------------
// Global error handler
// ---------------------------------------------------------------------------

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  // Multer file size / type errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ success: false, code: 'FILE_TOO_LARGE', message: 'File must be 5 MB or smaller.' });
  }
  if (err.status === 400) {
    return res.status(400).json({ success: false, code: 'BAD_REQUEST', message: err.message });
  }
  console.error('[unhandled]', err);
  return res.status(500).json({ success: false, code: 'SERVER_ERROR', message: 'An unexpected error occurred.' });
});

// ---------------------------------------------------------------------------
// Socket.IO
// ---------------------------------------------------------------------------

io.on('connection', (socket) => {
  console.log(`[socket] connected: ${socket.id}`);

  // Join a room keyed by userId so the server can push targeted notifications
  socket.on('join', (userId) => {
    socket.join(`user:${userId}`);
    console.log(`[socket] ${socket.id} joined room user:${userId}`);
  });

  socket.on('disconnect', () => {
    console.log(`[socket] disconnected: ${socket.id}`);
  });
});

// ---------------------------------------------------------------------------
// Background jobs
// ---------------------------------------------------------------------------

const { scheduleOfferExpiry } = require('../services/offerService');
const { expireCoupons }       = require('../services/couponService');

scheduleOfferExpiry();   // every 15 minutes — deactivates expired offers + their coupons
expireCoupons();         // every 30 minutes — belt-and-suspenders coupon expiry

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.PORT || '4000', 10);

httpServer.listen(PORT, () => {
  console.log(`[server] Dander API running on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
  console.log(`[server] Health: http://localhost:${PORT}/health`);
});

// ---------------------------------------------------------------------------
// Graceful shutdown on SIGTERM / SIGINT
// ---------------------------------------------------------------------------

const pool = require('../db/pool');

async function shutdown(signal) {
  console.log(`\n[server] ${signal} received — shutting down gracefully…`);

  // Stop accepting new connections
  httpServer.close(async () => {
    console.log('[server] HTTP server closed.');

    // Disconnect all Socket.IO clients
    io.close(() => {
      console.log('[server] Socket.IO closed.');
    });

    // Drain the PostgreSQL connection pool
    try {
      await pool.end();
      console.log('[server] Database pool closed.');
    } catch (err) {
      console.error('[server] Error closing DB pool:', err.message);
    }

    console.log('[server] Shutdown complete.');
    process.exit(0);
  });

  // Force-kill after 10 s if something hangs
  setTimeout(() => {
    console.error('[server] Forced shutdown after timeout.');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
