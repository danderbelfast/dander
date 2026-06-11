# Standing up a TapProve staging environment

Goal: a one-time manual setup that gives you a parallel `staging` stack
(API, dashboard, user SPA, admin panel) you can deploy to first, smoke
against, and only then promote to production.

After this is in place, the iteration loop becomes:

```
push to main
  → Netlify deploys staging frontends + Railway deploys staging API
  → `npm run smoke -- https://staging-api.tapprove.io`
  → manual eyeball pass
  → promote to production (Railway redeploy + Netlify "Publish deploy")
  → `npm run smoke -- https://api.tapprove.io`
```

Code does not have to change again — every URL is env-var driven now.

---

## 1. Railway — duplicate the API service

1. Railway → existing `tapprove` project → ⋯ menu on the `backend` service →
   **Duplicate service**. Name it `backend-staging`.
2. The duplicated service gets its own `RAILWAY_SERVICE_ID`. Link it to a
   **separate Postgres** (Railway → Add Service → Postgres) so staging
   writes don't leak into the production database. Copy the new
   `DATABASE_URL` into the staging service's Variables tab. The
   migration runner in `backend/db/migrate.js` will populate the schema
   on first boot.
3. On the staging service's Variables tab, set:

   | Variable             | Value                              |
   |----------------------|------------------------------------|
   | `NODE_ENV`           | `staging`                          |
   | `DEPLOY_ENV`         | `staging` (drives the startup banner) |
   | `DATABASE_URL`       | (the staging Postgres URL)         |
   | `JWT_SECRET`         | a fresh secret (don't reuse prod)  |
   | `ADMIN_SECRET_KEY`   | a fresh secret                     |
   | `USER_APP_URL`       | `https://staging.tapprove.io`           |
   | `BUSINESS_APP_URL`   | `https://staging-business.tapprove.io`  |
   | `ADMIN_APP_URL`      | `https://staging-admin.tapprove.io`     |
   | `API_PUBLIC_URL`     | `https://staging-api.tapprove.io`       |
   | `FRONTEND_URL`       | `https://staging.tapprove.io,https://staging-business.tapprove.io,https://staging-admin.tapprove.io` |
   | `RESEND_API_KEY`     | a Resend test key (no real sends)  |
   | `TWILIO_*`           | a Twilio test creds                |
   | `CLOUDINARY_URL`     | a separate staging Cloudinary      |
   | `STRIPE_SECRET_KEY`  | `sk_test_…` (Stripe test mode)     |
   | `MAINTENANCE_MODE`   | `false`                            |

   Anything not listed inherits the same Railway defaults as the
   backend service. Refer to `backend/.env.example` for the full list.

4. Point a `staging-api.tapprove.io` CNAME (or Railway-managed domain) at
   the staging service. Railway → Settings → Domains → Add Domain.

## 2. Netlify — three new sites

For each of the three frontends, create a new Netlify site pointing at
the same Git repository on a `staging` branch (or `main`, your call —
Netlify supports per-branch deploys).

For each site, in **Site settings → Environment variables**, set:

### Staging dashboard (`staging-business.tapprove.io`)
```
VITE_API_URL=https://staging-api.tapprove.io
```
Build command: `npm install && npm run build`.
Publish directory: `frontend-business/dist`.
Base directory: `frontend-business`.

### Staging user SPA (`staging.tapprove.io`)
```
VITE_API_URL=https://staging-api.tapprove.io
VITE_PUBLIC_APP_URL=https://staging.tapprove.io
VITE_BUSINESS_PORTAL_URL=https://staging-business.tapprove.io
VITE_SALES_EMAIL=staging@tapprove.io      # optional — keeps staging emails off production inbox
```
Build / publish / base mirror the same pattern under `frontend-user`.

### Staging admin (`staging-admin.tapprove.io`)
```
VITE_API_URL=https://staging-api.tapprove.io
```
Build / publish / base under `frontend-admin`.

## 3. Verify

```bash
# Mint smoke tokens for the test user/business in the STAGING database
# (one-time per environment — see backend/scripts/smoke-test.js header).
cd backend
SMOKE_USER_TOKEN=…  SMOKE_USER_ID=…  \
SMOKE_BUSINESS_TOKEN=…  SMOKE_BUSINESS_ID=…  \
npm run smoke -- https://staging-api.tapprove.io
```

All 5 tests pass → you're clear to deploy to production.

## 4. House rules

- Deploys go staging → prod. Production-direct pushes are blocked at the
  CI level once we move there.
- Production deploys happen outside trading hours.
- `MAINTENANCE_MODE=true` on Railway is the emergency kill switch — it
  503s every API call except `/health`. No redeploy needed to flip it.
