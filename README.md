# Dander

Dander is an npm workspaces monorepo containing a Node.js/Express backend and three React frontends (user, business, admin), plus a shared utilities package.

---

## Monorepo structure

```
dander/
├── backend/              # Node.js + Express REST API + Socket.IO
│   └── src/
│       └── index.js
├── frontend-user/        # React app for end users (mobile-first)
│   ├── src/
│   │   ├── main.jsx
│   │   └── App.jsx
│   └── vite.config.js
├── frontend-business/    # React app for business owners
│   ├── src/
│   │   ├── main.jsx
│   │   └── App.jsx
│   └── vite.config.js
├── frontend-admin/       # React app for platform admins
│   ├── src/
│   │   ├── main.jsx
│   │   └── App.jsx
│   └── vite.config.js
├── shared/               # Shared constants, types, and utility functions
│   └── src/
│       └── index.js
├── .env.example          # Environment variable template
├── .gitignore
└── package.json          # Root workspace config
```

---

## Packages

| Package | Name | Dev port |
|---|---|---|
| `backend` | `@dander/backend` | 4000 |
| `frontend-user` | `@dander/frontend-user` | 3000 |
| `frontend-business` | `@dander/frontend-business` | 3001 |
| `frontend-admin` | `@dander/frontend-admin` | 3002 |
| `shared` | `@dander/shared` | — |

---

## Getting started

### 1. Install dependencies

```bash
npm install
```

This installs all workspace dependencies from the root in one step.

### 2. Configure environment

```bash
cp .env.example .env
# Fill in your values in .env
```

### 3. Run in development

Start each workspace individually:

```bash
npm run dev:backend
npm run dev:frontend-user
npm run dev:frontend-business
npm run dev:frontend-admin
```

Or start everything at once (requires `concurrently`):

```bash
npm run dev:all
```

---

## Backend dependencies

| Package | Purpose |
|---|---|
| `express` | HTTP server framework |
| `pg` | PostgreSQL client |
| `dotenv` | Environment variable loading |
| `axios` | HTTP client for outbound requests |
| `bcrypt` | Password hashing |
| `jsonwebtoken` | JWT creation and verification |
| `speakeasy` | TOTP/HOTP two-factor auth |
| `qrcode` | QR code generation (for 2FA setup) |
| `multer` | Multipart file upload handling |
| `sharp` | Image processing and resizing |
| `node-cron` | Scheduled background jobs |
| `express-validator` | Request validation middleware |
| `socket.io` | Real-time WebSocket communication |
| `cors` | Cross-Origin Resource Sharing |
| `helmet` | Security-related HTTP headers |
| `morgan` | HTTP request logging |

---

## Frontend dependencies (all three apps)

| Package | Purpose |
|---|---|
| `react` / `react-dom` | UI framework |
| `react-router-dom` | Client-side routing |
| `axios` | HTTP client for API calls |
| `leaflet` + `react-leaflet` | Interactive maps |
| `date-fns` | Date formatting and manipulation |

---

## Shared package (`@dander/shared`)

Exposes constants and utilities consumed by all workspaces:

- `USER_ROLES` — role constants (`user`, `business`, `admin`)
- `HTTP_STATUS` — common HTTP status codes
- `formatDate(date)` — locale-aware date formatter
- `slugify(str)` — URL-safe slug generator
- `isValidEmail(email)` — email format validator

---

## Environment variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret for signing JWTs |
| `ADMIN_SECRET_KEY` | Secret for admin-level operations |
| `TWILIO_ACCOUNT_SID` | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_PHONE_NUMBER` | Twilio sender phone number |
| `CLOUDINARY_URL` | Cloudinary connection URL |
| `PORT` | Backend server port (default: `4000`) |
| `FRONTEND_URL` | Allowed CORS origin for the backend |
