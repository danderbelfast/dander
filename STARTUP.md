# Dander — Startup Guide

## Requirements
- PC must be **on and running**
- PostgreSQL must be running (auto-starts with Windows — check with `pg_isready -h localhost -p 5432`)
- ngrok installed and authenticated

---

## Every Session

### 1. Start the app
Open a terminal in `C:\Users\shery\dander` and run:
```bash
npm run dev:all
```

This starts all 4 services:
| Service | URL |
|---|---|
| User app (mobile) | http://localhost:3000 |
| Business panel | http://localhost:3001 |
| Admin panel | http://localhost:3002 |
| Backend API | http://localhost:4000 |

---

### 2. Start ngrok (for mobile testing)
Open a **second terminal** and run:
```bash
ngrok http 3000
```

Copy the `https://....ngrok-free.app` URL and open it on your phone.

> **Note:** The ngrok URL changes every time you restart it (free plan).

---

### 3. Check everything is working
```bash
curl http://localhost:4000/health
```
Should return `{"status":"ok",...}`

---

## Accounts

### Admin panel — http://localhost:3002
| | |
|---|---|
| Email | `admin@dander.com` |
| Password | `Admin123!` |
| 2FA | Scan `C:\Users\shery\dander-admin-qr.png` |

### Business panel — http://localhost:3001
| | |
|---|---|
| Email | `owner.test@dander.com` |
| Password | `Password1!` |
| 2FA | Scan `C:\Users\shery\dander-test-business-qr.png` |

---

## Test Businesses & Locations

| Business | Address | Coordinates |
|---|---|---|
| The Crown Liquor Saloon | 46 Great Victoria St, Belfast | 54.5956, -5.9342 |
| SPAR Albertbridge Road | 310 Albertbridge Rd, Belfast BT5 4GX | 54.604199, -5.874477 |
| Lidl Connswater | Connswater Link, Belfast BT5 5DL | 54.596098, -5.892695 |
| Creggs | 65 Station Road, BT4 1RF | 54.608201, -5.875356 |

---

## Database
- **Host:** localhost:5432
- **Database:** dander
- **User:** postgres
- **Password:** postgres
- **URL:** `postgresql://postgres:postgres@localhost:5432/dander`

---

## Re-seed test data (if needed)
```bash
cd C:\Users\shery\dander\backend
node scripts/seed-test-business.js     # Crown Bar + test owner account
node scripts/seed-more-businesses.js   # SPAR, Lidl, Creggs
```
