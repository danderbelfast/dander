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
