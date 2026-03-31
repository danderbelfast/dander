# Dander — Deployment Guide

This guide covers deploying Dander to production:

- **Backend API** → Railway (Node.js + PostgreSQL)
- **Frontend apps** → Netlify (3 separate sites)
- **Media storage** → Cloudinary
- **SMS** → Twilio

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Railway — Backend + Database](#2-railway--backend--database)
3. [Environment Variables Reference](#3-environment-variables-reference)
4. [Netlify — Frontend Apps](#4-netlify--frontend-apps)
5. [Cloudinary Setup](#5-cloudinary-setup)
6. [Twilio Setup](#6-twilio-setup)
7. [First Admin User](#7-first-admin-user)
8. [Seed Data](#8-seed-data)
9. [Verifying the Deployment](#9-verifying-the-deployment)

---

## 1. Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 20.x | Local dev / build |
| npm | 10.x | Package management |
| Railway CLI | latest | Deploy & manage Railway |
| Netlify CLI | latest | Deploy frontends |
| psql | 15.x | DB admin |

Install CLIs:

```bash
npm install -g @railway/cli netlify-cli
```

---

## 2. Railway — Backend + Database

### 2a. Create a Railway project

1. Go to [railway.app](https://railway.app) and sign in.
2. Click **New Project** → **Empty project**.
3. Name it `dander`.

### 2b. Add PostgreSQL

1. Inside the project, click **+ New** → **Database** → **PostgreSQL**.
2. Railway provisions a Postgres 15 instance and sets `DATABASE_URL` automatically on services in the same project.
3. Copy the **connection string** from the database's **Connect** tab — you'll need it for local admin access.

### 2c. Deploy the backend service

```bash
# From the repo root
railway login
railway link          # select the dander project
railway up --service api
```

Or connect via GitHub:

1. Click **+ New** → **GitHub Repo** in the Railway project.
2. Select this repository.
3. Set **Root Directory** to `/` (Railway will find `backend/railway.toml`).
4. Railway uses nixpacks with the config in `backend/railway.toml`:
   - Build: `npm install` (inside `backend/`)
   - Start: `node src/index.js`
   - Health check: `GET /health`

> **Note:** Railway runs the build inside the `backend/` directory because `railway.toml` is placed there. If you deploy from the repo root via CLI, cd into `backend/` first or set the root directory in the Railway dashboard.

### 2d. Set environment variables

In the Railway dashboard → **API service** → **Variables**, add every variable from [Section 3](#3-environment-variables-reference).

Railway automatically injects `DATABASE_URL` from the linked PostgreSQL service — do **not** set it manually unless you're using an external database.

### 2e. Database migration

The backend runs migrations automatically on startup via `db/migrate.js`. To run manually:

```bash
railway run --service api node db/migrate.js
```

Or connect directly:

```bash
railway connect postgres   # opens a psql shell
\i backend/db/schema.sql   # if you need to reset
```

---

## 3. Environment Variables Reference

Set all of these on the Railway **API service**. Never commit `.env` files.

### Backend (Railway)

| Variable | Example | Notes |
|----------|---------|-------|
| `DATABASE_URL` | `postgresql://...` | Auto-set by Railway PostgreSQL plugin |
| `JWT_SECRET` | 64-char random hex | `openssl rand -hex 32` |
| `ADMIN_SECRET_KEY` | 32-char random | Used to bootstrap first admin |
| `TWILIO_ACCOUNT_SID` | `ACxxxxxxxx...` | From Twilio console |
| `TWILIO_AUTH_TOKEN` | `...` | From Twilio console |
| `TWILIO_FROM_NUMBER` | `+441234567890` | Your Twilio number |
| `CLOUDINARY_URL` | `cloudinary://key:secret@cloud` | From Cloudinary dashboard |
| `PORT` | `4000` | Railway sets this automatically |
| `NODE_ENV` | `production` | Set to `production` |
| `FRONTEND_URL` | `https://dander.netlify.app` | User app URL (for CORS) |
| `PLATFORM_NAME` | `Dander` | Shown in SMS messages |

Generate secrets:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Frontend apps (.env files for Netlify)

Each frontend needs one environment variable:

| Frontend | Variable | Value |
|----------|----------|-------|
| `frontend-user` | `VITE_API_URL` | `https://your-api.up.railway.app` |
| `frontend-business` | `VITE_API_URL` | `https://your-api.up.railway.app` |
| `frontend-admin` | `VITE_API_URL` | `https://your-api.up.railway.app` |

Copy the `.env.example` in each frontend directory and fill in your Railway backend URL:

```bash
cp frontend-user/.env.example frontend-user/.env.local
cp frontend-business/.env.example frontend-business/.env.local
cp frontend-admin/.env.example frontend-admin/.env.local
```

---

## 4. Netlify — Frontend Apps

Deploy each of the three frontends as a separate Netlify site. Each has a `netlify.toml` that configures the build command and SPA redirects.

### Option A — Netlify CLI (recommended for first deploy)

```bash
# User app
cd frontend-user
netlify login
netlify init          # create a new site
netlify env:set VITE_API_URL https://your-api.up.railway.app
netlify deploy --build --prod
cd ..

# Business app
cd frontend-business
netlify init
netlify env:set VITE_API_URL https://your-api.up.railway.app
netlify deploy --build --prod
cd ..

# Admin app
cd frontend-admin
netlify init
netlify env:set VITE_API_URL https://your-api.up.railway.app
netlify deploy --build --prod
cd ..
```

### Option B — Netlify Dashboard (Git-connected)

1. Go to [app.netlify.com](https://app.netlify.com) → **Add new site** → **Import an existing project**.
2. Connect your GitHub repo.
3. Set **Base directory** to the frontend folder (e.g., `frontend-user`).
4. Netlify auto-detects `netlify.toml` — build command and publish dir are pre-filled.
5. Add `VITE_API_URL` under **Site settings → Environment variables**.
6. Click **Deploy site**.

Repeat steps 1–6 for `frontend-business` and `frontend-admin`.

### CORS configuration

After deploying, add each Netlify site URL to the backend `FRONTEND_URL` variable. If you have multiple allowed origins, update `backend/src/index.js` to accept an array:

```bash
# In Railway dashboard, set:
FRONTEND_URL=https://dander.netlify.app
# Add additional origins in index.js if needed
```

---

## 5. Cloudinary Setup

Cloudinary is used for all media uploads (offer images, business logos/covers). If `CLOUDINARY_URL` is not set, the backend falls back to local disk storage — fine for dev, not suitable for production (Railway's filesystem is ephemeral).

1. Sign up at [cloudinary.com](https://cloudinary.com) — the free tier gives 25 GB storage + 25 GB bandwidth/month.
2. From the **Dashboard**, copy your **API Environment variable** — it looks like:
   ```
   cloudinary://123456789012345:AbCdEfGhIjKlMnOpQrStUvWxYz@your-cloud-name
   ```
3. Set `CLOUDINARY_URL` on the Railway backend service.
4. Optionally create upload presets:
   - Go to **Settings → Upload** → **Upload presets** → **Add upload preset**.
   - Name it `dander_offers` / `dander_logos`.
   - Set folder to `dander/offers` / `dander/logos`.

Images are automatically processed through sharp (resize + WebP conversion) before being sent to Cloudinary.

---

## 6. Twilio Setup

Twilio is used for:
- Login 2FA codes (TOTP SMS)
- Welcome SMS on first login
- Business approval/suspension notifications

If `TWILIO_ACCOUNT_SID` is not set, SMS calls are silently skipped — the app still works.

1. Sign up at [twilio.com](https://twilio.com). The trial account gives ~$15 credit.
2. From the **Console Dashboard**, copy:
   - **Account SID** → `TWILIO_ACCOUNT_SID`
   - **Auth Token** → `TWILIO_AUTH_TOKEN`
3. Get a phone number: **Phone Numbers → Manage → Buy a number**.
   - For Belfast/UK, choose a `+44` number.
   - Set it as `TWILIO_FROM_NUMBER`.
4. On trial accounts, you can only send SMS to verified numbers. Go to **Verified Caller IDs** to add test numbers.
5. Set all three variables on the Railway backend service.

---

## 7. First Admin User

The database schema creates the `users` table but no admin accounts. Create the first admin directly via SQL.

### 7a. Connect to the database

Via Railway CLI:

```bash
railway connect postgres
```

Or using the connection string from the Railway dashboard:

```bash
psql "postgresql://postgres:password@host.railway.internal:5432/railway"
```

### 7b. Insert the admin user

```sql
-- Generate a bcrypt hash first (Node.js one-liner):
-- node -e "require('bcrypt').hash('YourPassword123!', 12).then(console.log)"

INSERT INTO users (
  email,
  password_hash,
  first_name,
  last_name,
  phone,
  role,
  is_verified,
  totp_enabled,
  created_at,
  updated_at
) VALUES (
  'admin@dander.app',
  '$2b$12$<your-bcrypt-hash-here>',
  'Admin',
  'User',
  '+447700000000',
  'admin',
  true,
  false,
  NOW(),
  NOW()
);
```

Replace `$2b$12$<your-bcrypt-hash-here>` with the output of:

```bash
node -e "const b=require('bcrypt'); b.hash('YourPassword123!', 12).then(console.log)"
```

> Run this locally in the `backend/` directory where bcrypt is installed.

### 7c. Set up TOTP (optional but recommended)

On first login to the admin panel, if `totp_enabled = false`, you can set it to true after verifying in the admin app. Alternatively set it directly:

```sql
UPDATE users SET totp_enabled = true WHERE email = 'admin@dander.app';
-- You'll also need a totp_secret — the app generates one during setup
```

The safest approach: log in via the admin app with `totp_enabled = false`, complete the TOTP setup flow in-app, then it auto-enables.

---

## 8. Seed Data

A seed file is provided at `backend/db/seed.sql`. It creates sample businesses, offers, and users for testing.

> **Warning:** Only run seed data on a fresh database or a staging environment. It is not idempotent for all tables.

```bash
# Via Railway CLI
railway connect postgres
\i /path/to/backend/db/seed.sql

# Or pipe directly
psql "postgresql://..." < backend/db/seed.sql
```

### What seed.sql creates

- 5 sample businesses in Belfast (coffee shops, restaurants, bars)
- 10–15 sample offers with varied discount types
- 20 sample user accounts (password: `Password123!` for all)
- Sample redemption history for the last 30 days

After seeding, you can log into the admin panel and see populated charts on the Dashboard and Reports pages.

---

## 9. Verifying the Deployment

### Backend health check

```bash
curl https://your-api.up.railway.app/health
# Expected: { "status": "ok", "timestamp": "...", "uptime": ... }
```

### Database connectivity

```bash
curl https://your-api.up.railway.app/api/auth/register \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"Test1234!","firstName":"Test","lastName":"User","phone":"+447700000001"}'
# Expected: 201 with { accessToken, refreshToken, user }
```

### Frontend apps

| App | URL | Login |
|-----|-----|-------|
| User app | `https://dander.netlify.app` | Register a new account |
| Business app | `https://dander-biz.netlify.app` | Register a business |
| Admin app | `https://dander-admin.netlify.app` | Use the admin user from Step 7 |

### Deployment checklist

- [ ] `GET /health` returns `{ status: "ok" }`
- [ ] User registration and login work
- [ ] Business registration and login work
- [ ] Admin login works (with TOTP if configured)
- [ ] Image upload stores to Cloudinary (check the Cloudinary dashboard)
- [ ] SMS sends on registration/login (check Twilio logs)
- [ ] Admin dashboard shows stats
- [ ] Offer map pins appear on the admin dashboard map

---

## Troubleshooting

### Railway deployment fails

- Check build logs in the Railway dashboard under **Deployments**.
- Ensure `NODE_ENV=production` is set.
- Verify `DATABASE_URL` is present (auto-injected from the PostgreSQL plugin).

### "relation does not exist" database errors

Run migrations manually:

```bash
railway run --service api node db/migrate.js
```

### Frontend shows blank page

- Open browser devtools → Console — usually a `VITE_API_URL` pointing to wrong host.
- Check that `VITE_API_URL` in Netlify env vars matches your Railway backend URL exactly (no trailing slash).
- Verify `netlify.toml` SPA redirect is in place (`/* → /index.html`).

### SMS not sending

- Check that `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER` are all set.
- On trial accounts, the destination number must be verified in the Twilio console.
- Check Railway logs: `railway logs --service api | grep notificationService`.

### Image uploads falling back to local disk

- Verify `CLOUDINARY_URL` format: `cloudinary://api_key:api_secret@cloud_name`.
- Check Railway logs for `[imageService]` errors.
- Cloudinary free tier limits: 25 GB storage, 25 GB bandwidth/month.
