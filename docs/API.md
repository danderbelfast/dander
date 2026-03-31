# Dander API Reference

Base URL: `http://localhost:4000` (development) · `https://api.dander.io` (production)

All endpoints return JSON. Successful responses include `"success": true`. Errors include `"success": false`, a `"code"` string, and a human-readable `"message"`.

---

## Authentication

| Header | Value |
|--------|-------|
| `Authorization` | `Bearer <accessToken>` |

Access tokens expire after **24 hours**. Use `POST /api/auth/refresh` to get a new one.

**Auth levels used in this document:**

| Level | Meaning |
|-------|---------|
| `none` | No token required |
| `user` | Any verified user token |
| `business` | Business-owner token + active/pending business |
| `admin` | Admin-role token |

---

## Auth Routes — `/api/auth`

Rate-limited: **10 requests / minute**.

---

### `POST /api/auth/register`

Register a new end-user account. Returns TOTP QR code for 2FA setup.

**Auth:** none

**Request body:**
```json
{
  "email":     "user@example.com",
  "password":  "securePassword123",
  "firstName": "Niamh",
  "lastName":  "O'Brien",
  "phone":     "+447911123456"
}
```

**Response `201`:**
```json
{
  "success":      true,
  "userId":       42,
  "totpSecret":   "JBSWY3DPEHPK3PXP",
  "qrCodeDataUrl": "data:image/png;base64,..."
}
```

**Example:**
```bash
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"niamh@example.com","password":"Hunter2!","firstName":"Niamh","lastName":"OBrien","phone":"+447700900123"}'
```

---

### `POST /api/auth/verify-2fa`

Verify the TOTP code after registration to activate the account.

**Auth:** none

**Request body:**
```json
{
  "userId":    42,
  "totpCode":  "123456"
}
```

**Response `200`:**
```json
{
  "success":  true,
  "verified": true
}
```

**Example:**
```bash
curl -X POST http://localhost:4000/api/auth/verify-2fa \
  -H "Content-Type: application/json" \
  -d '{"userId":42,"totpCode":"123456"}'
```

---

### `POST /api/auth/login`

Step 1 of login: validate credentials, receive a temp token for 2FA.

**Auth:** none

**Request body:**
```json
{
  "email":    "user@example.com",
  "password": "securePassword123"
}
```

**Response `200` (2FA required — normal flow):**
```json
{
  "success":     true,
  "requires2FA": true,
  "tempToken":   "eyJ..."
}
```

**Example:**
```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"niamh@example.com","password":"Hunter2!"}'
```

---

### `POST /api/auth/login/verify`

Step 2 of login: submit TOTP code, receive access + refresh tokens.

**Auth:** none (uses `tempToken` from step 1)

**Request body:**
```json
{
  "tempToken": "eyJ...",
  "totpCode":  "123456"
}
```

**Response `200`:**
```json
{
  "success":      true,
  "accessToken":  "eyJ...",
  "refreshToken": "eyJ...",
  "user": {
    "id":        42,
    "email":     "niamh@example.com",
    "role":      "user",
    "firstName": "Niamh",
    "lastName":  "O'Brien"
  }
}
```

**Example:**
```bash
curl -X POST http://localhost:4000/api/auth/login/verify \
  -H "Content-Type: application/json" \
  -d '{"tempToken":"eyJ...","totpCode":"123456"}'
```

---

### `POST /api/auth/refresh`

Exchange a refresh token for a new access token.

**Auth:** none

**Request body:**
```json
{ "refreshToken": "eyJ..." }
```

**Response `200`:**
```json
{
  "success":      true,
  "accessToken":  "eyJ...",
  "refreshToken": "eyJ..."
}
```

**Example:**
```bash
curl -X POST http://localhost:4000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"eyJ..."}'
```

---

### `POST /api/auth/business/register`

Register a new business account (owner + business in one step).

**Auth:** none

**Request body:**
```json
{
  "owner": {
    "email":     "owner@example.com",
    "password":  "securePassword123",
    "firstName": "Kieran",
    "lastName":  "Kelly"
  },
  "business": {
    "name":        "Kelly's Cellar",
    "category":    "Drinks",
    "address":     "30 Bank Street",
    "city":        "Belfast",
    "phone":       "+442890324835",
    "website":     "https://kellyscellar.co.uk",
    "description": "Belfast's oldest bar."
  }
}
```

**Response `201`:**
```json
{
  "success":      true,
  "userId":       43,
  "businessId":   7,
  "totpSecret":   "JBSWY3DPEHPK3PXP",
  "qrCodeDataUrl": "data:image/png;base64,..."
}
```

**Example:**
```bash
curl -X POST http://localhost:4000/api/auth/business/register \
  -H "Content-Type: application/json" \
  -d '{"owner":{"email":"owner@example.com","password":"Pass1234!","firstName":"Kieran","lastName":"Kelly"},"business":{"name":"Kellys Cellar","category":"Drinks","city":"Belfast"}}'
```

---

## Offer Routes — `/api/offers`

---

### `GET /api/offers/nearby`

Get offers within a radius of the user's location.

**Auth:** none (anonymous browsing; pass token to get saved-offer status)

**Query params:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `lat` | float | yes | User latitude |
| `lng` | float | yes | User longitude |
| `radius` | int | no | Search radius in metres (default: 2000) |
| `category` | string | no | Filter by category |
| `limit` | int | no | Max results (default: 20, max: 50) |
| `offset` | int | no | Pagination offset |

**Response `200`:**
```json
{
  "success": true,
  "offers": [
    {
      "id":              1,
      "title":           "20% off all cocktails",
      "description":     "Every Thursday 5–9pm.",
      "category":        "Drinks",
      "discountType":    "percentage",
      "discountValue":   20,
      "originalPrice":   null,
      "businessName":    "Kelly's Cellar",
      "businessLogoUrl": "https://res.cloudinary.com/...",
      "latitude":        54.5973,
      "longitude":       -5.9301,
      "distanceMetres":  180,
      "expiresAt":       "2026-04-01T21:00:00.000Z",
      "redemptionCap":   100,
      "currentRedemptions": 34,
      "isSaved":         false
    }
  ],
  "total": 1
}
```

**Example:**
```bash
curl "http://localhost:4000/api/offers/nearby?lat=54.5973&lng=-5.9301&radius=1000&category=Drinks"
```

---

### `GET /api/offers/:id`

Get a single offer by ID.

**Auth:** none

**Response `200`:**
```json
{
  "success": true,
  "offer": {
    "id":              1,
    "title":           "20% off all cocktails",
    "description":     "Every Thursday 5–9pm.",
    "category":        "Drinks",
    "discountType":    "percentage",
    "discountValue":   20,
    "termsAndConditions": "Dine-in only. Not valid with other offers.",
    "businessName":    "Kelly's Cellar",
    "businessId":      7,
    "imageUrl":        "https://res.cloudinary.com/...",
    "radiusMeters":    500,
    "expiresAt":       "2026-04-01T21:00:00.000Z",
    "startsAt":        "2026-03-01T00:00:00.000Z",
    "redemptionCap":   100,
    "currentRedemptions": 34
  }
}
```

**Example:**
```bash
curl http://localhost:4000/api/offers/1
```

---

### `POST /api/offers/:id/view`

Record a view impression for an offer.

**Auth:** user

**Response `200`:**
```json
{ "success": true }
```

**Example:**
```bash
curl -X POST http://localhost:4000/api/offers/1/view \
  -H "Authorization: Bearer eyJ..."
```

---

### `GET /api/offers/saved`

Get all offers saved by the authenticated user.

**Auth:** user

**Response `200`:**
```json
{
  "success": true,
  "offers":  [ /* same shape as nearby */ ]
}
```

**Example:**
```bash
curl http://localhost:4000/api/offers/saved \
  -H "Authorization: Bearer eyJ..."
```

---

### `POST /api/offers/:id/save`

Save an offer to the user's saved list.

**Auth:** user

**Response `201`:**
```json
{ "success": true }
```

**Example:**
```bash
curl -X POST http://localhost:4000/api/offers/1/save \
  -H "Authorization: Bearer eyJ..."
```

---

### `DELETE /api/offers/:id/save`

Remove an offer from the user's saved list.

**Auth:** user

**Response `200`:**
```json
{ "success": true }
```

**Example:**
```bash
curl -X DELETE http://localhost:4000/api/offers/1/save \
  -H "Authorization: Bearer eyJ..."
```

---

## Coupon Routes — `/api/coupons`

All coupon routes require user authentication.

---

### `POST /api/coupons/generate`

Generate a coupon for an offer. Checks user is within radius.

**Auth:** user

**Request body:**
```json
{ "offerId": 1 }
```

**Response `201`:**
```json
{
  "success": true,
  "coupon": {
    "id":        88,
    "code":      "XK4M-RQJP",
    "offerId":   1,
    "offerTitle": "20% off all cocktails",
    "status":    "active",
    "expiresAt": "2026-04-01T21:00:00.000Z"
  }
}
```

**Example:**
```bash
curl -X POST http://localhost:4000/api/coupons/generate \
  -H "Authorization: Bearer eyJ..." \
  -H "Content-Type: application/json" \
  -d '{"offerId":1}'
```

---

### `GET /api/coupons/mine`

Get all coupons for the authenticated user, grouped by status.

**Auth:** user

**Response `200`:**
```json
{
  "success": true,
  "coupons": {
    "active":   [ { "id": 88, "code": "XK4M-RQJP", "offerTitle": "...", "expiresAt": "..." } ],
    "redeemed": [ ],
    "expired":  [ ]
  }
}
```

**Example:**
```bash
curl http://localhost:4000/api/coupons/mine \
  -H "Authorization: Bearer eyJ..."
```

---

### `POST /api/coupons/redeem`

Redeem a coupon. Called by business staff at point of sale.

**Auth:** business

**Request body:**
```json
{
  "code":     "XK4M-RQJP",
  "staffPin": "1234"
}
```

**Response `200`:**
```json
{
  "success":      true,
  "code":         "XK4M-RQJP",
  "offerTitle":   "20% off all cocktails",
  "customerName": "Niamh O'Brien",
  "redeemedAt":   "2026-03-21T18:45:00.000Z"
}
```

**Example:**
```bash
curl -X POST http://localhost:4000/api/coupons/redeem \
  -H "Authorization: Bearer eyJ..." \
  -H "Content-Type: application/json" \
  -d '{"code":"XK4M-RQJP","staffPin":"1234"}'
```

---

## Business Routes — `/api/business`

All business routes require a valid business-owner token and an active or pending business account.

---

### `GET /api/business/me`

Get the authenticated business owner's profile.

**Auth:** business

**Response `200`:**
```json
{
  "success": true,
  "business": {
    "id":          7,
    "name":        "Kelly's Cellar",
    "category":    "Drinks",
    "address":     "30 Bank Street",
    "city":        "Belfast",
    "phone":       "+442890324835",
    "website":     "https://kellyscellar.co.uk",
    "description": "Belfast's oldest bar.",
    "logoUrl":     "https://res.cloudinary.com/...",
    "coverUrl":    "https://res.cloudinary.com/...",
    "status":      "active",
    "latitude":    54.5973,
    "longitude":   -5.9301,
    "activeOfferCount":  2,
    "totalRedemptions":  87,
    "ownerEmail":  "owner@example.com"
  }
}
```

**Example:**
```bash
curl http://localhost:4000/api/business/me \
  -H "Authorization: Bearer eyJ..."
```

---

### `PUT /api/business/me`

Update business profile. Accepts `multipart/form-data` with optional `logo` and `cover` image files.

**Auth:** business

**Form fields:**

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Business name |
| `category` | string | Category |
| `address` | string | Street address |
| `city` | string | City |
| `phone` | string | Contact phone |
| `website` | string | Website URL |
| `description` | string | Public description |
| `logo` | file | Logo image (PNG/JPG, max 5 MB) |
| `cover` | file | Cover photo (PNG/JPG, max 5 MB) |

**Response `200`:**
```json
{
  "success":  true,
  "business": { /* updated profile */ }
}
```

**Example:**
```bash
curl -X PUT http://localhost:4000/api/business/me \
  -H "Authorization: Bearer eyJ..." \
  -F "name=Kelly's Cellar" \
  -F "city=Belfast" \
  -F "logo=@/path/to/logo.png"
```

---

### `GET /api/business/dashboard`

Get dashboard stats: active offers, recent redemptions, 14-day chart.

**Auth:** business

**Response `200`:**
```json
{
  "success": true,
  "activeOffers":       2,
  "totalRedemptions":  87,
  "weekRedemptions":   14,
  "topOffer": { "id": 1, "title": "20% off cocktails", "redemptions": 62 },
  "chartData": [
    { "day": "03-08", "redemptions": 3 },
    { "day": "03-09", "redemptions": 7 }
  ],
  "activeOffers": [ /* offer list */ ]
}
```

**Example:**
```bash
curl http://localhost:4000/api/business/dashboard \
  -H "Authorization: Bearer eyJ..."
```

---

### `GET /api/business/offers`

List all offers for this business.

**Auth:** business

**Response `200`:**
```json
{
  "success": true,
  "offers":  [ { "id": 1, "title": "...", "status": "active", "viewCount": 45, "redemptionCount": 34 } ]
}
```

**Example:**
```bash
curl http://localhost:4000/api/business/offers \
  -H "Authorization: Bearer eyJ..."
```

---

### `GET /api/business/offers/:id`

Get a single offer (must belong to this business).

**Auth:** business

**Response `200`:**
```json
{
  "success": true,
  "offer": { /* full offer object */ }
}
```

**Example:**
```bash
curl http://localhost:4000/api/business/offers/1 \
  -H "Authorization: Bearer eyJ..."
```

---

### `POST /api/business/offers`

Create a new offer. Accepts `multipart/form-data`.

**Auth:** business

**Form fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | yes | Offer headline |
| `description` | string | no | Longer description |
| `category` | string | no | Category |
| `discountType` | string | yes | `percentage` / `fixed` / `bogo` / `free_item` / `custom` |
| `discountValue` | number | conditional | Required for percentage/fixed |
| `originalPrice` | number | no | Pre-discount price (£) |
| `termsAndConditions` | string | no | T&Cs text |
| `startsAt` | ISO date | yes | Offer start datetime |
| `expiresAt` | ISO date | no | Offer expiry datetime |
| `redemptionCap` | int | no | Max total redemptions |
| `perUserLimit` | int | no | Max per user (default: 1) |
| `radiusMeters` | int | no | Visibility radius (default: 500) |
| `image` | file | no | Offer image (PNG/JPG, max 5 MB) |

**Response `201`:**
```json
{
  "success": true,
  "offer":   { "id": 2, "title": "...", "status": "active" }
}
```

**Example:**
```bash
curl -X POST http://localhost:4000/api/business/offers \
  -H "Authorization: Bearer eyJ..." \
  -F "title=20% off all cocktails" \
  -F "discountType=percentage" \
  -F "discountValue=20" \
  -F "startsAt=2026-04-01T17:00:00Z" \
  -F "expiresAt=2026-04-01T21:00:00Z" \
  -F "radiusMeters=500"
```

---

### `PUT /api/business/offers/:id`

Update an existing offer. Same `multipart/form-data` fields as create.

**Auth:** business

**Response `200`:**
```json
{
  "success": true,
  "offer":   { /* updated offer */ }
}
```

**Example:**
```bash
curl -X PUT http://localhost:4000/api/business/offers/1 \
  -H "Authorization: Bearer eyJ..." \
  -F "title=30% off all cocktails"
```

---

### `DELETE /api/business/offers/:id`

Deactivate an offer (soft delete — sets `is_active = false`).

**Auth:** business

**Response `200`:**
```json
{ "success": true, "message": "Offer deactivated." }
```

**Example:**
```bash
curl -X DELETE http://localhost:4000/api/business/offers/1 \
  -H "Authorization: Bearer eyJ..."
```

---

### `GET /api/business/offers/:id/stats`

Get campaign stats for a specific offer.

**Auth:** business

**Response `200`:**
```json
{
  "success": true,
  "offer":        { "id": 1, "title": "...", "status": "active", "radiusMeters": 500 },
  "totalViews":       145,
  "totalRedemptions": 34,
  "dailyData":  [ { "day": "03-08", "views": 12, "redemptions": 3 } ],
  "hourlyData": [ { "hour": 17, "redemptions": 8 } ]
}
```

**Example:**
```bash
curl http://localhost:4000/api/business/offers/1/stats \
  -H "Authorization: Bearer eyJ..."
```

---

## Admin Routes — `/api/admin`

All admin routes require an admin-role JWT. All actions are server-side logged.

---

### `GET /api/admin/stats`

Platform-wide statistics.

**Auth:** admin

**Response `200`:**
```json
{
  "success": true,
  "stats": {
    "users":          { "total": 1248, "active": 1200 },
    "businesses":     { "total": 42, "active": 38, "pending": 4 },
    "offers":         { "total": 156, "active": 89 },
    "coupons":        { "total": 3400, "redeemed": 2980 },
    "redemptions":    { "today": 14, "this_week": 87, "this_month": 342 },
    "top_businesses": [ { "name": "Kelly's Cellar", "total_redemptions": 420 } ],
    "top_offers":     [ { "title": "...", "business_name": "...", "current_redemptions": 120 } ],
    "signups_last_30d": [ { "date": "2026-02-20", "signups": 8 } ]
  }
}
```

**Example:**
```bash
curl http://localhost:4000/api/admin/stats \
  -H "Authorization: Bearer eyJ..."
```

---

### `GET /api/admin/map`

Active business locations for the dashboard map.

**Auth:** admin

**Response `200`:**
```json
{
  "success": true,
  "businesses": [
    {
      "id": 7, "name": "Kelly's Cellar", "category": "Drinks",
      "latitude": 54.5973, "longitude": -5.9301,
      "activeOffers": 2, "redemptions": 420
    }
  ]
}
```

**Example:**
```bash
curl http://localhost:4000/api/admin/map \
  -H "Authorization: Bearer eyJ..."
```

---

### `GET /api/admin/businesses`

List all businesses with pagination and optional status filter.

**Auth:** admin

**Query params:**

| Param | Type | Description |
|-------|------|-------------|
| `status` | string | `pending` / `active` / `suspended` |
| `city` | string | Filter by city (partial match) |
| `page` | int | Page number (default: 1) |
| `limit` | int | Per page (default: 20, max: 100) |

**Response `200`:**
```json
{
  "success": true,
  "total": 42,
  "page": 1,
  "limit": 20,
  "businesses": [
    {
      "id": 7, "name": "Kelly's Cellar", "category": "Drinks",
      "city": "Belfast", "status": "active",
      "owner_email": "owner@example.com",
      "active_offers": 2,
      "created_at": "2026-01-15T10:00:00.000Z"
    }
  ]
}
```

**Example:**
```bash
curl "http://localhost:4000/api/admin/businesses?status=pending&limit=10" \
  -H "Authorization: Bearer eyJ..."
```

---

### `GET /api/admin/businesses/:id`

Full business detail including offers and recent redemptions.

**Auth:** admin

**Response `200`:**
```json
{
  "success": true,
  "business": { /* full profile */ },
  "offers": [ /* offer list */ ],
  "recentRedemptions": [ { "code": "XK4M-RQJP", "offerTitle": "...", "redeemedAt": "..." } ]
}
```

**Example:**
```bash
curl http://localhost:4000/api/admin/businesses/7 \
  -H "Authorization: Bearer eyJ..."
```

---

### `PUT /api/admin/businesses/:id/approve`

Approve a pending business (sets `status = 'active'`, sends owner SMS).

**Auth:** admin

**Response `200`:**
```json
{ "success": true, "business": { "id": 7, "status": "active" }, "message": "Business approved." }
```

**Example:**
```bash
curl -X PUT http://localhost:4000/api/admin/businesses/7/approve \
  -H "Authorization: Bearer eyJ..."
```

---

### `PUT /api/admin/businesses/:id/suspend`

Suspend a business (sets `status = 'suspended'`, sends owner SMS).

**Auth:** admin

**Request body:**
```json
{ "reason": "Policy violation — misleading offer descriptions." }
```

**Response `200`:**
```json
{ "success": true, "business": { "id": 7, "status": "suspended" }, "message": "Business suspended." }
```

**Example:**
```bash
curl -X PUT http://localhost:4000/api/admin/businesses/7/suspend \
  -H "Authorization: Bearer eyJ..." \
  -H "Content-Type: application/json" \
  -d '{"reason":"Policy violation"}'
```

---

### `GET /api/admin/offers`

List all offers across all businesses.

**Auth:** admin

**Query params:**

| Param | Type | Description |
|-------|------|-------------|
| `status` | string | `active` / `scheduled` / `expired` / `inactive` / `removed` |
| `category` | string | Offer category |
| `from` | ISO date | Created/expires after this date |
| `to` | ISO date | Created/expires before this date |
| `page` | int | Page number |
| `limit` | int | Per page (max: 100) |

**Response `200`:**
```json
{
  "success": true,
  "total": 156,
  "offers": [
    {
      "id": 1, "title": "20% off cocktails", "businessName": "Kelly's Cellar",
      "category": "Drinks", "discountType": "percentage", "discountValue": 20,
      "viewCount": 145, "redemptionCount": 34, "status": "active",
      "expiresAt": "2026-04-01T21:00:00.000Z"
    }
  ]
}
```

**Example:**
```bash
curl "http://localhost:4000/api/admin/offers?status=active&category=Drinks" \
  -H "Authorization: Bearer eyJ..."
```

---

### `PUT /api/admin/offers/:id/remove`

Remove an offer from the platform (sets `is_active = false`).

**Auth:** admin

**Request body:**
```json
{ "reason": "Misleading discount claim." }
```

**Response `200`:**
```json
{ "success": true, "offer": { "id": 1, "is_active": false }, "message": "Offer removed from platform." }
```

**Example:**
```bash
curl -X PUT http://localhost:4000/api/admin/offers/1/remove \
  -H "Authorization: Bearer eyJ..." \
  -H "Content-Type: application/json" \
  -d '{"reason":"Misleading discount claim"}'
```

---

### `GET /api/admin/users`

List users with search and pagination.

**Auth:** admin

**Query params:**

| Param | Type | Description |
|-------|------|-------------|
| `search` | string | Partial match on email, first name, last name |
| `page` | int | Page number |
| `limit` | int | Per page (default: 20, max: 100) |

**Response `200`:**
```json
{
  "success": true,
  "total": 1248,
  "users": [
    {
      "id": 42, "email": "niamh@example.com",
      "first_name": "Niamh", "last_name": "O'Brien",
      "role": "user", "is_active": true,
      "created_at": "2026-01-10T09:00:00.000Z",
      "total_redeemed": 7
    }
  ]
}
```

**Example:**
```bash
curl "http://localhost:4000/api/admin/users?search=niamh&limit=10" \
  -H "Authorization: Bearer eyJ..."
```

---

### `PUT /api/admin/users/:id/suspend`

Suspend a user account (sets `is_active = false`). Cannot suspend own account.

**Auth:** admin

**Request body:**
```json
{ "reason": "Fraudulent coupon activity." }
```

**Response `200`:**
```json
{ "success": true, "user": { "id": 42, "email": "niamh@example.com", "is_active": false }, "message": "User suspended." }
```

**Example:**
```bash
curl -X PUT http://localhost:4000/api/admin/users/42/suspend \
  -H "Authorization: Bearer eyJ..." \
  -H "Content-Type: application/json" \
  -d '{"reason":"Fraudulent activity"}'
```

---

### `GET /api/admin/reports`

Aggregated platform analytics for charts.

**Auth:** admin

**Response `200`:**
```json
{
  "success": true,
  "categoryBreakdown":  [ { "category": "Drinks", "redemptions": 420 } ],
  "offerTypeBreakdown": [ { "type": "percentage", "count": 89 } ],
  "businessGrowth":     [ { "month": "Jan 26", "total": 12, "active": 10, "pending": 2 } ],
  "dailyRedemptions":   [ { "day": "03-01", "redemptions": 14 } ]
}
```

**Example:**
```bash
curl http://localhost:4000/api/admin/reports \
  -H "Authorization: Bearer eyJ..."
```

---

### `GET /api/admin/export/:type`

Download a CSV export. `type` must be `users`, `businesses`, or `redemptions`.

**Auth:** admin

**Response:** `text/csv` file download (max 5,000 rows for redemptions).

**Example:**
```bash
curl http://localhost:4000/api/admin/export/redemptions \
  -H "Authorization: Bearer eyJ..." \
  -o redemptions.csv
```

---

### `GET /api/admin/settings`

Get current platform settings.

**Auth:** admin

**Response `200`:**
```json
{
  "success":         true,
  "platformName":    "Dander",
  "supportEmail":    "support@dander.io",
  "maintenanceMode": false,
  "defaultRadius":   500
}
```

**Example:**
```bash
curl http://localhost:4000/api/admin/settings \
  -H "Authorization: Bearer eyJ..."
```

---

### `PUT /api/admin/settings`

Update platform settings.

**Auth:** admin

**Request body:**
```json
{
  "platformName":    "Dander",
  "supportEmail":    "support@dander.io",
  "maintenanceMode": false,
  "defaultRadius":   500
}
```

**Response `200`:**
```json
{ "success": true, "message": "Settings saved." }
```

**Example:**
```bash
curl -X PUT http://localhost:4000/api/admin/settings \
  -H "Authorization: Bearer eyJ..." \
  -H "Content-Type: application/json" \
  -d '{"maintenanceMode":true}'
```

---

### `POST /api/admin/users/admin`

Create a new admin account.

**Auth:** admin

**Request body:**
```json
{
  "email":     "newadmin@dander.io",
  "firstName": "Siobhan",
  "lastName":  "Murphy",
  "password":  "TempPass123!"
}
```

**Response `201`:**
```json
{
  "success": true,
  "user":    { "id": 99, "email": "newadmin@dander.io", "role": "admin" },
  "message": "Admin account created."
}
```

**Example:**
```bash
curl -X POST http://localhost:4000/api/admin/users/admin \
  -H "Authorization: Bearer eyJ..." \
  -H "Content-Type: application/json" \
  -d '{"email":"newadmin@dander.io","firstName":"Siobhan","lastName":"Murphy","password":"TempPass123!"}'
```

---

## Utility

### `GET /health`

Health check endpoint. No auth required. Used by load balancers and Docker healthchecks.

**Response `200`:**
```json
{ "status": "ok", "timestamp": "2026-03-21T18:00:00.000Z" }
```

**Example:**
```bash
curl http://localhost:4000/health
```

---

## Error codes

| Code | HTTP | Meaning |
|------|------|---------|
| `VALIDATION_ERROR` | 400 | Request body / query param failed validation |
| `BAD_REQUEST` | 400 | Malformed request |
| `UNAUTHORIZED` | 401 | Missing or invalid token |
| `FORBIDDEN` | 403 | Valid token but insufficient role/permission |
| `NOT_FOUND` | 404 | Resource does not exist |
| `CONFLICT` | 409 | Resource already exists (e.g. duplicate email) |
| `RATE_LIMITED` | 429 | Too many requests — back off and retry |
| `FILE_TOO_LARGE` | 413 | Upload exceeds 5 MB limit |
| `INVALID_TOTP` | 401 | Incorrect or expired 2FA code |
| `OUTSIDE_RADIUS` | 403 | User is not within the offer's geo-radius |
| `ALREADY_REDEEMED` | 409 | Coupon has already been redeemed |
| `CAP_REACHED` | 409 | Offer redemption cap has been hit |
| `SERVER_ERROR` | 500 | Unexpected server-side error |
