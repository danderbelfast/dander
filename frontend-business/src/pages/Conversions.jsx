import React, { useEffect, useState } from 'react';
import client from '../api/client';
import { LoadingBlock } from '../components/ui/Spinner';
import { useToast } from '../context/ToastContext';
import { useCurrency } from '../hooks/useCurrency';

/**
 * Conversions — the data that will make advertisers pay for TapProve Ads.
 *
 * Funnel per ad:
 *   Clicks  →  Entry conversions (visited within 7 days of click)
 *           →  Qualified sales   (purchased same visit)
 *
 * Commission tracked is the 5% sale-value share that WILL be charged
 * when billing is switched on. For now it's pure forecasting data.
 */
export default function Conversions() {
  const { toast } = useToast();
  const { fmt } = useCurrency();
  const [loading, setLoading] = useState(true);
  const [ads, setAds] = useState([]);

  useEffect(() => {
    client.get('/api/ads/conversions')
      .then((r) => setAds(r.data?.ads || []))
      .catch((err) => toast({
        message: err.response?.data?.message || 'Failed to load conversions.',
        type: 'error',
      }))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingBlock label="Loading conversions…" />;

  const totals = ads.reduce((acc, a) => ({
    clicks:     acc.clicks     + (a.clicks || 0),
    entries:    acc.entries    + (a.entry_conversions || 0),
    sales:      acc.sales      + (a.qualified_sales || 0),
    saleValue:  acc.saleValue  + (a.sale_value_total || 0),
    commission: acc.commission + (a.commission_tracked || 0),
  }), { clicks: 0, entries: 0, sales: 0, saleValue: 0, commission: 0 });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>Ad Conversions</h2>
        <p style={{ color: 'var(--c-text-muted)', fontSize: '0.88rem', marginTop: 4 }}>
          Tracking only — commission shown is the 5% share that will be
          charged when billing switches on. Nothing is billed yet.
        </p>
      </div>

      <div style={summaryGrid}>
        <SummaryCard label="Clicks"             value={totals.clicks} />
        <SummaryCard label="Entry conversions"  value={totals.entries} sub={`${pct(totals.entries, totals.clicks)}% of clicks`} />
        <SummaryCard label="Qualified sales"    value={totals.sales}   sub={`${pct(totals.sales, totals.entries)}% of visits`} />
        <SummaryCard label="Sale value"         value={fmt(totals.saleValue)} />
        <SummaryCard label="Commission tracked" value={fmt(totals.commission)} sub="not yet charged" />
      </div>

      {ads.length === 0 ? (
        <div className="card">
          <div className="card-body" style={{ color: 'var(--c-text-muted)' }}>
            No ads yet. When you publish an ad and a customer clicks
            through, this page will fill in click → visit → sale.
          </div>
        </div>
      ) : (
        <div className="card">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--c-border, rgba(0,0,0,0.08))' }}>
                  <Th>Ad</Th>
                  <Th align="right">Clicks</Th>
                  <Th align="right">Visits</Th>
                  <Th align="right">Sales</Th>
                  <Th align="right">Click → visit</Th>
                  <Th align="right">Visit → sale</Th>
                  <Th align="right">Sale value</Th>
                  <Th align="right">Commission</Th>
                </tr>
              </thead>
              <tbody>
                {ads.map((a) => (
                  <tr key={a.ad_id} style={{ borderBottom: '1px solid var(--c-border, rgba(0,0,0,0.04))' }}>
                    <Td>
                      <div style={{ fontWeight: 600 }}>{a.ad_title}</div>
                      {!a.is_active && (
                        <div style={{ fontSize: '0.72rem', color: 'var(--c-text-muted)' }}>inactive</div>
                      )}
                    </Td>
                    <Td align="right">{a.clicks}</Td>
                    <Td align="right">{a.entry_conversions}</Td>
                    <Td align="right">{a.qualified_sales}</Td>
                    <Td align="right">{a.click_to_visit}%</Td>
                    <Td align="right">{a.visit_to_sale}%</Td>
                    <Td align="right">{fmt(a.sale_value_total)}</Td>
                    <Td align="right">{fmt(a.commission_tracked)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function pct(n, d) {
  if (!d) return 0;
  return Math.round((n / d) * 1000) / 10;
}

function SummaryCard({ label, value, sub }) {
  return (
    <div className="card">
      <div className="card-body">
        <div style={{ fontSize: '0.78rem', color: 'var(--c-text-muted)', fontWeight: 600, letterSpacing: 0.5 }}>
          {label.toUpperCase()}
        </div>
        <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: 4 }}>{value}</div>
        {sub && (
          <div style={{ fontSize: '0.74rem', color: 'var(--c-text-muted)', marginTop: 2 }}>{sub}</div>
        )}
      </div>
    </div>
  );
}

function Th({ children, align = 'left' }) {
  return (
    <th style={{ textAlign: align, padding: '10px 12px', fontWeight: 600, color: 'var(--c-text-muted)' }}>
      {children}
    </th>
  );
}

function Td({ children, align = 'left' }) {
  return (
    <td style={{ textAlign: align, padding: '10px 12px' }}>{children}</td>
  );
}

const summaryGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
  gap: 12,
};
