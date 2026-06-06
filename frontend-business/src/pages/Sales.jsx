import React, { useEffect, useState } from 'react';
import { listSales } from '../api/business';
import { LoadingBlock } from '../components/ui/Spinner';
import { useToast } from '../context/ToastContext';

/**
 * Sales — read-only list of till_transactions for the authenticated
 * business. Each row is a single NFC-till award (created by
 * POST /api/till/award-points). This is the dataset that becomes the
 * Physical AdWords targeting layer.
 */
export default function Sales() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);

  useEffect(() => {
    listSales({ limit: 200 })
      .then((r) => setRows(r.transactions || []))
      .catch((err) => {
        toast({
          message: err.response?.data?.message || 'Failed to load sales.',
          type: 'error',
        });
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingBlock label="Loading sales…" />;

  const totalAmount = rows.reduce((s, r) => s + Number(r.amount_spent || 0), 0);
  const totalPoints = rows.reduce((s, r) => s + Number(r.points_awarded || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>Sales</h2>
        <p style={{ color: 'var(--c-text-muted)', fontSize: '0.88rem', marginTop: 4 }}>
          Till NFC transactions. {rows.length} shown · £{totalAmount.toFixed(2)} ·{' '}
          {totalPoints.toLocaleString()} points awarded.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="card">
          <div className="card-body" style={{ color: 'var(--c-text-muted)' }}>
            No till transactions yet. Customers tap the till sticker and you'll
            see the customer panel slide in; once you award points the sale lands
            here.
          </div>
        </div>
      ) : (
        <div className="card">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--c-border, rgba(0,0,0,0.08))' }}>
                  <Th>When</Th>
                  <Th>Customer</Th>
                  <Th align="right">Amount</Th>
                  <Th>Category</Th>
                  <Th>Item</Th>
                  <Th align="right">Points</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--c-border, rgba(0,0,0,0.04))' }}>
                    <Td>{formatWhen(r.created_at)}</Td>
                    <Td>{r.customer_first_name}</Td>
                    <Td align="right">£{Number(r.amount_spent).toFixed(2)}</Td>
                    <Td>{r.category || '—'}</Td>
                    <Td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.item_description || '—'}
                    </Td>
                    <Td align="right">{r.points_awarded}</Td>
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

function Th({ children, align = 'left' }) {
  return (
    <th style={{ textAlign: align, padding: '10px 12px', fontWeight: 600, color: 'var(--c-text-muted)' }}>
      {children}
    </th>
  );
}

function Td({ children, align = 'left', style }) {
  return (
    <td style={{ textAlign: align, padding: '10px 12px', ...style }}>
      {children}
    </td>
  );
}

function formatWhen(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}
