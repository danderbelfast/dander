import React, { useEffect, useState, useCallback } from 'react';
import { format } from 'date-fns';
import { getAdminOffers, removeOffer } from '../api/admin';
import { useToast } from '../context/ToastContext';
import { LoadingBlock } from '../components/ui/Spinner';
import { ConfirmModal } from '../components/ui/Modal';

function StatusBadge({ status }) {
  const map = { active: 'badge-active', scheduled: 'badge-scheduled', expired: 'badge-expired', inactive: 'badge-expired', removed: 'badge-suspended' };
  return <span className={`badge ${map[status] || 'badge-expired'}`}>{status}</span>;
}

const CATEGORIES = ['Food & Drink', 'Beauty & Wellness', 'Health & Fitness', 'Entertainment', 'Retail & Shopping', 'Services', 'Experiences & Leisure', 'Other'];
const STATUSES   = ['active', 'scheduled', 'expired', 'inactive', 'removed'];

export default function Offers() {
  const { addToast } = useToast();

  const [offers, setOffers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal]     = useState(0);

  // Filters
  const [search, setSearch]     = useState('');
  const [status, setStatus]     = useState('');
  const [category, setCategory] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate]     = useState('');

  // Remove modal
  const [removeTarget, setRemoveTarget] = useState(null); // { id, title }
  const [removeReason, setRemoveReason] = useState('');
  const [acting, setActing] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const params = {};
    if (status)   params.status = status;
    if (category) params.category = category;
    if (fromDate) params.from = fromDate;
    if (toDate)   params.to = toDate;

    getAdminOffers(params)
      .then((d) => { setOffers(d.offers || d); setTotal(d.total || (d.offers || d).length); })
      .catch(() => addToast('Failed to load offers.', 'error'))
      .finally(() => setLoading(false));
  }, [status, category, fromDate, toDate]);

  useEffect(load, [load]);

  const filtered = search
    ? offers.filter((o) => o.title?.toLowerCase().includes(search.toLowerCase()) || o.business_name?.toLowerCase().includes(search.toLowerCase()))
    : offers;

  async function doRemove() {
    if (!removeTarget) return;
    setActing(true);
    try {
      await removeOffer(removeTarget.id, removeReason);
      addToast(`"${removeTarget.title}" removed.`, 'info');
      setRemoveTarget(null); setRemoveReason('');
      load();
    } catch {
      addToast('Failed to remove offer.', 'error');
    } finally { setActing(false); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      <div className="page-header">
        <div>
          <div className="page-title">Offers</div>
          <div className="page-sub">{total} total across all businesses</div>
        </div>
      </div>

      <div className="card">
        {/* Filter bar */}
        <div className="filter-bar">
          <input
            className="input search"
            style={{ fontSize: '0.78rem', padding: '6px 10px' }}
            placeholder="Search title or business…"
            value={search} onChange={(e) => setSearch(e.target.value)}
          />
          <select className="select" style={{ width: 130 }} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="select" style={{ width: 150 }} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input className="input" type="date" style={{ width: 140 }} value={fromDate} onChange={(e) => setFromDate(e.target.value)} title="From date" />
          <input className="input" type="date" style={{ width: 140 }} value={toDate}   onChange={(e) => setToDate(e.target.value)} title="To date" />
          <button className="btn btn-ghost btn-sm" onClick={() => { setStatus(''); setCategory(''); setFromDate(''); setToDate(''); setSearch(''); }}>
            Clear
          </button>
          <div className="filter-spacer" />
          <button className="btn btn-secondary btn-sm" onClick={load}>Refresh</button>
        </div>

        {/* Table */}
        {loading ? (
          <LoadingBlock label="Loading offers…" />
        ) : filtered.length === 0 ? (
          <div className="empty-state"><div className="empty-icon">🏷️</div>No offers match the current filters.</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Business</th>
                  <th>Category</th>
                  <th>Type</th>
                  <th>Discount</th>
                  <th>Views</th>
                  <th>Claimed</th>
                  <th>Redeemed</th>
                  <th>Expires</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => (
                  <tr key={o.id}>
                    <td style={{ fontWeight: 500, maxWidth: 200 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.title}</div>
                    </td>
                    <td style={{ fontSize: '0.76rem', color: 'var(--c-text-muted)' }}>{o.business_name}</td>
                    <td>{o.category || '—'}</td>
                    <td style={{ fontSize: '0.74rem', textTransform: 'capitalize' }}>{o.offer_type?.replace('_', ' ') || '—'}</td>
                    <td className="table-mono">
                      {o.offer_price != null ? `£${o.offer_price}` : '—'}
                    </td>
                    <td className="table-mono">—</td>
                    <td className="table-mono">{parseInt(o.claimed_count  ?? 0, 10)}</td>
                    <td className="table-mono">{parseInt(o.redeemed_count ?? 0, 10)}</td>
                    <td style={{ fontSize: '0.74rem', color: 'var(--c-text-muted)', whiteSpace: 'nowrap' }}>
                      {o.expires_at ? format(new Date(o.expires_at), 'dd MMM yy') : '—'}
                    </td>
                    <td><StatusBadge status={o.status || (o.is_active ? 'active' : 'inactive')} /></td>
                    <td>
                      {o.status === 'active' && (
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => { setRemoveReason(''); setRemoveTarget({ id: o.id, title: o.title }); }}
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {removeTarget && (
        <ConfirmModal
          title={`Remove "${removeTarget.title}"?`}
          message="This offer will be hidden from all users immediately."
          confirmLabel={acting ? 'Removing…' : 'Remove offer'}
          danger
          onConfirm={doRemove}
          onCancel={() => setRemoveTarget(null)}
        >
          <div className="field">
            <label className="label">Reason (required)</label>
            <textarea className="textarea" rows={2} value={removeReason}
              onChange={(e) => setRemoveReason(e.target.value)}
              placeholder="Misleading, spam, policy violation…" required />
          </div>
        </ConfirmModal>
      )}

    </div>
  );
}
