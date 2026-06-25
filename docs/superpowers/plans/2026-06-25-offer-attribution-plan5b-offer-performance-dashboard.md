# Offer Attribution — Plan 5B: Offer Performance dashboard

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Checkbox steps.

**Goal:** The payoff view — a business-facing **Offer Performance** page showing the per-offer funnel (activated → visited → bought) with conversion rates, a per-channel breakdown (window sticker / web / app), and a headline **attributed sales £**. Reads the `offer_activations` funnel built in Plans 1–3 + the channel rollup from 5A.

**Architecture:** New `GET /api/offers/performance?range=` (requireBusiness) returns per-offer + per-channel + totals rollups, mirroring `GET /api/ads/conversions`. New `frontend-business` page `OfferPerformance.jsx` mirrors `Conversions.jsx`. Time presets anchored on `activated_at`. Per-channel `GROUP BY channel` (coarse), so `sticker_*` roll up to `sticker`. Attributed sales = gross post-discount `sale_amount` on `qualified_sale` rows, labelled honestly. Commission omitted.

**Tech Stack:** Express + pg; React + Vite. **Branch:** worktree off `pre-staging`.

**Verification note:** No backend route harness and `frontend-business` has zero test harness (repo convention — see memory `frontend-business-no-tests`). Backend verified via `node --check` + staging curl; frontend via `npm run build` (built `VITE_UNLOCK_APP=true` — a plain prod build dead-code-eliminates the app under the maintenance lockdown) + device. The funnel data itself is already proven (Plan 3 DB-verified).

**Definition of done (device-verified on staging):**
- (a) Offer Performance appears in the Analytics sidebar; page loads;
- (b) hero shows attributed sales £ + activated/visited/bought with rates;
- (c) per-offer table lists offers with activity in range, correct funnel + attributed £;
- (d) per-channel breakdown splits window sticker / web / app, with `sticker_*` rolled up under sticker;
- (e) range pills (7d/30d/90d/All) re-filter by activation date;
- (f) no commission shown anywhere; empty state when no activity.

---

## Task 1: Backend `GET /api/offers/performance` (requireBusiness)

**Files:** Modify `backend/routes/offers.js`

- [ ] **Step 1:** Add `requireBusiness` to the auth import:
```js
const { requireAuth, optionalAuth, requireBusiness } = require('../middleware/auth');
```

- [ ] **Step 2:** Register the route **immediately after the `GET /activated` route** (both must precede the `/:id` param routes, or `performance` is matched as an id). Insert:
```js
// ---------------------------------------------------------------------------
// GET /api/offers/performance?range=7d|30d|90d|all  (requireBusiness)
// Per-offer + per-channel offer-attribution funnel for the dashboard.
// Funnel: activated -> visited (entry_conversion|qualified_sale) -> bought
// (qualified_sale). Attributed sales = gross post-discount sale_amount on
// qualified_sale rows. Anchored on activated_at. Channel is the coarse rollup
// (sticker_* -> sticker). Commission intentionally omitted (rate=0).
// ---------------------------------------------------------------------------
router.get('/performance', requireBusiness, async (req, res) => {
  const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90, 'all': null };
  const range = Object.prototype.hasOwnProperty.call(RANGE_DAYS, req.query.range) ? req.query.range : '30d';
  const days = RANGE_DAYS[range];
  const cutoff = days == null ? null : new Date(Date.now() - days * 86400000).toISOString();

  try {
    const { rows: offerRows } = await pool.query(
      `SELECT o.id, o.title, o.is_active,
              COUNT(a.id)                                                       AS activated,
              COUNT(*) FILTER (WHERE a.status IN ('entry_conversion','qualified_sale')) AS visited,
              COUNT(*) FILTER (WHERE a.status = 'qualified_sale')               AS bought,
              COALESCE(SUM(a.sale_amount) FILTER (WHERE a.status = 'qualified_sale'), 0) AS attributed_sales
         FROM offers o
         JOIN offer_activations a ON a.offer_id = o.id
        WHERE o.business_id = $1
          AND ($2::timestamptz IS NULL OR a.activated_at >= $2)
        GROUP BY o.id, o.title, o.is_active
       HAVING COUNT(a.id) > 0
        ORDER BY attributed_sales DESC, activated DESC`,
      [req.business.id, cutoff]
    );

    const { rows: channelRows } = await pool.query(
      `SELECT a.channel,
              COUNT(a.id)                                                       AS activated,
              COUNT(*) FILTER (WHERE a.status IN ('entry_conversion','qualified_sale')) AS visited,
              COUNT(*) FILTER (WHERE a.status = 'qualified_sale')               AS bought,
              COALESCE(SUM(a.sale_amount) FILTER (WHERE a.status = 'qualified_sale'), 0) AS attributed_sales
         FROM offer_activations a
        WHERE a.business_id = $1
          AND ($2::timestamptz IS NULL OR a.activated_at >= $2)
        GROUP BY a.channel
        ORDER BY a.channel`,
      [req.business.id, cutoff]
    );

    const rate = (n, d) => (d > 0 ? Math.round((n / d) * 10000) / 100 : 0);

    const by_offer = offerRows.map((r) => {
      const activated = Number(r.activated) || 0;
      const visited   = Number(r.visited)   || 0;
      const bought    = Number(r.bought)    || 0;
      return {
        offer_id: r.id, title: r.title, is_active: r.is_active,
        activated, visited, bought,
        activated_to_visited: rate(visited, activated),
        visited_to_bought:    rate(bought, visited),
        attributed_sales:     Number(r.attributed_sales) || 0,
      };
    });

    const by_channel = channelRows.map((r) => ({
      channel: r.channel,
      activated: Number(r.activated) || 0,
      visited:   Number(r.visited)   || 0,
      bought:    Number(r.bought)    || 0,
      attributed_sales: Number(r.attributed_sales) || 0,
    }));

    const totals = by_offer.reduce((acc, o) => ({
      activated: acc.activated + o.activated,
      visited:   acc.visited   + o.visited,
      bought:    acc.bought    + o.bought,
      attributed_sales: acc.attributed_sales + o.attributed_sales,
    }), { activated: 0, visited: 0, bought: 0, attributed_sales: 0 });

    return ok(res, { range, totals, by_offer, by_channel });
  } catch (err) {
    console.error('[offers/performance]', err);
    return fail(res, 500, 'SERVER_ERROR', 'Failed to load offer performance.');
  }
});
```

- [ ] **Step 3:** `node --check backend/routes/offers.js` → clean.
- [ ] **Step 4:** Commit: `feat: GET /api/offers/performance (per-offer + per-channel funnel)`.

---

## Task 2: `OfferPerformance` page (frontend-business)

**Files:** Create `frontend-business/src/pages/OfferPerformance.jsx`

- [ ] **Step 1:** Create the page (mirrors `Conversions.jsx`; range pills, hero cards, per-offer table, per-channel breakdown; no commission):
```jsx
import React, { useEffect, useState } from 'react';
import client from '../api/client';
import { LoadingBlock } from '../components/ui/Spinner';
import { useToast } from '../context/ToastContext';
import { useCurrency } from '../hooks/useCurrency';

/**
 * Offer Performance — the per-offer, per-channel attribution funnel.
 *   Activated → Visited (entry_conversion) → Bought (qualified_sale)
 * Attributed sales = gross post-discount spend on visits where an activated
 * offer was applied (not an incrementality claim). Commission omitted.
 */
const RANGES = [
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: '90d', label: '90 days' },
  { key: 'all', label: 'All time' },
];
const CHANNEL_LABELS = { sticker: 'Window sticker', web: 'Web', app: 'App' };

export default function OfferPerformance() {
  const { toast } = useToast();
  const { fmt } = useCurrency();
  const [range, setRange] = useState('30d');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    client.get('/api/offers/performance', { params: { range } })
      .then((r) => { if (alive) setData(r.data); })
      .catch((err) => toast({ message: err.response?.data?.message || 'Failed to load offer performance.', type: 'error' }))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [range]);

  const totals = data?.totals || { activated: 0, visited: 0, bought: 0, attributed_sales: 0 };
  const byOffer = data?.by_offer || [];
  const byChannel = data?.by_channel || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>Offer Performance</h2>
          <p style={{ color: 'var(--c-text-muted)', fontSize: '0.88rem', marginTop: 4 }}>
            Activated → visited → bought, by activation date. Attributed sales = total spend on
            visits where an activated offer was applied at the till.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {RANGES.map((r) => (
            <button key={r.key} type="button" onClick={() => setRange(r.key)} style={pillStyle(range === r.key)}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? <LoadingBlock label="Loading offer performance…" /> : (
        <>
          <div style={summaryGrid}>
            <SummaryCard label="Attributed sales" value={fmt(totals.attributed_sales)} hero />
            <SummaryCard label="Activated" value={totals.activated} />
            <SummaryCard label="Visited" value={totals.visited} sub={`${pct(totals.visited, totals.activated)}% of activated`} />
            <SummaryCard label="Bought" value={totals.bought} sub={`${pct(totals.bought, totals.visited)}% of visits`} />
          </div>

          <div className="card">
            <div className="card-body" style={{ paddingBottom: 0 }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>By offer</h3>
            </div>
            {byOffer.length === 0 ? (
              <div className="card-body" style={{ color: 'var(--c-text-muted)' }}>No offer activity in this period.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={tableStyle}>
                  <thead>
                    <tr style={trHead}>
                      <Th>Offer</Th><Th align="right">Activated</Th><Th align="right">Visited</Th>
                      <Th align="right">Bought</Th><Th align="right">Activated → visited</Th>
                      <Th align="right">Visited → bought</Th><Th align="right">Attributed sales</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {byOffer.map((o) => (
                      <tr key={o.offer_id} style={trBody}>
                        <Td>
                          <div style={{ fontWeight: 600 }}>{o.title}</div>
                          {!o.is_active && <div style={{ fontSize: '0.72rem', color: 'var(--c-text-muted)' }}>inactive</div>}
                        </Td>
                        <Td align="right">{o.activated}</Td>
                        <Td align="right">{o.visited}</Td>
                        <Td align="right">{o.bought}</Td>
                        <Td align="right">{o.activated_to_visited}%</Td>
                        <Td align="right">{o.visited_to_bought}%</Td>
                        <Td align="right">{fmt(o.attributed_sales)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-body" style={{ paddingBottom: 0 }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>By channel</h3>
              <p style={{ color: 'var(--c-text-muted)', fontSize: '0.8rem', marginTop: 2 }}>
                Which channel drove the activation — the sticker-ROI view.
              </p>
            </div>
            {byChannel.length === 0 ? (
              <div className="card-body" style={{ color: 'var(--c-text-muted)' }}>No channel activity in this period.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={tableStyle}>
                  <thead>
                    <tr style={trHead}>
                      <Th>Channel</Th><Th align="right">Activated</Th><Th align="right">Visited</Th>
                      <Th align="right">Bought</Th><Th align="right">Attributed sales</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {byChannel.map((c) => (
                      <tr key={c.channel} style={trBody}>
                        <Td>{CHANNEL_LABELS[c.channel] || c.channel}</Td>
                        <Td align="right">{c.activated}</Td>
                        <Td align="right">{c.visited}</Td>
                        <Td align="right">{c.bought}</Td>
                        <Td align="right">{fmt(c.attributed_sales)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function pct(n, d) { return d ? Math.round((n / d) * 1000) / 10 : 0; }

function SummaryCard({ label, value, sub, hero }) {
  return (
    <div className="card">
      <div className="card-body">
        <div style={{ fontSize: '0.78rem', color: 'var(--c-text-muted)', fontWeight: 600, letterSpacing: 0.5 }}>{label.toUpperCase()}</div>
        <div style={{ fontSize: hero ? '2rem' : '1.6rem', fontWeight: 700, marginTop: 4, color: hero ? '#16a34a' : 'inherit' }}>{value}</div>
        {sub && <div style={{ fontSize: '0.74rem', color: 'var(--c-text-muted)', marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}
function Th({ children, align = 'left' }) {
  return <th style={{ textAlign: align, padding: '10px 12px', fontWeight: 600, color: 'var(--c-text-muted)' }}>{children}</th>;
}
function Td({ children, align = 'left' }) {
  return <td style={{ textAlign: align, padding: '10px 12px' }}>{children}</td>;
}
function pillStyle(active) {
  return {
    padding: '6px 12px', borderRadius: 999, fontSize: '0.82rem', cursor: 'pointer',
    border: active ? '1px solid #16a34a' : '1px solid var(--c-border, rgba(0,0,0,0.15))',
    background: active ? 'rgba(22,163,74,0.12)' : 'transparent',
    fontWeight: active ? 700 : 500,
  };
}
const summaryGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 };
const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' };
const trHead = { borderBottom: '1px solid var(--c-border, rgba(0,0,0,0.08))' };
const trBody = { borderBottom: '1px solid var(--c-border, rgba(0,0,0,0.04))' };
```

- [ ] **Step 2:** Commit: `feat: OfferPerformance dashboard page`.

---

## Task 3: Route + nav

**Files:** Modify `frontend-business/src/App.jsx`, `frontend-business/src/components/layout/Sidebar.jsx`

- [ ] **Step 1:** In `App.jsx`, import and route (next to Conversions):
```jsx
import OfferPerformance from './pages/OfferPerformance';
```
```jsx
          <Route path="/offer-performance" element={<OfferPerformance />} />
```

- [ ] **Step 2:** In `Sidebar.jsx`, add a nav item in the **Analytics** section directly after the `Ad Conversions` item:
```jsx
      { to: '/offer-performance', label: 'Offer Performance', icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>
        </svg>
      )},
```

- [ ] **Step 3:** (Optional polish) add `'/offer-performance': 'Offer Performance'` to `PAGE_TITLES` in `AppShell.jsx`.

- [ ] **Step 4:** Commit: `feat: route + Analytics nav item for Offer Performance`.

---

## Task 4: Verify + merge

- [ ] **Step 1:** `node --check backend/routes/offers.js`; `cd frontend-business && VITE_UNLOCK_APP=true npm run build` → succeeds (confirm `OfferPerformance`/"Attributed sales" string lands in `dist/assets/App-*.js`); `cd frontend-user && ../node_modules/.bin/vitest run` (untouched — sanity).
- [ ] **Step 2:** FF-merge to `pre-staging`, push (Railway redeploys API, Netlify redeploys business site). Clean up worktree.
- [ ] **Step 3: Staging curl-proof** (business JWT needed): `GET /api/offers/performance?range=all` for business 4 → confirm JSON has `totals`, `by_offer` (offer 1 with the Plan 3 qualified_sale + attributed £), and `by_channel` with a `sticker` row aggregating the `sticker_window`/`sticker` activations from 5A. (If no business token to hand, device-verify instead.)
- [ ] **Step 4: Device-verify DoD (a)–(f)** on the business dashboard (precondition: business site unlocked with `VITE_UNLOCK_APP=true`).

---

## Self-Review

**Spec coverage:** new Analytics page (T2/T3); endpoint with range (T1); hero + per-offer table + per-channel breakdown (T2); activation-anchored presets (T1 cutoff + T2 pills); attributed-sales honest label (T2 copy); commission omitted (no card/column). ✓
**Placeholders:** none — full SQL + full page code.
**Type consistency:** endpoint keys (`totals`, `by_offer`, `by_channel`, `activated/visited/bought/attributed_sales`, `activated_to_visited`, `visited_to_bought`) match the page's reads. `range` echoed. pg COUNT/SUM coerced with `Number()`.
**Rollup correctness:** `by_channel` groups by coarse `channel`, so 5A's `sticker_window` rolls up under `sticker`. `by_offer` inner-joins + activation-date cutoff → only offers with in-range activity. "Visited" = entry_conversion|qualified_sale (monotonic; till purchase counts as present).
**Scope:** offer×channel cross-tab, trends, CSV, commission forecast all deferred (not built).
