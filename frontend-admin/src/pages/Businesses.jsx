import React, { useEffect, useState, useCallback } from 'react';
import { format } from 'date-fns';
import { getBusinesses, getBusiness, approveBusiness, suspendBusiness, getBusinessProfit, getBusinessHoursAdmin } from '../api/admin';
import { useToast } from '../context/ToastContext';
import { Spinner, LoadingBlock } from '../components/ui/Spinner';
import { ConfirmModal, Drawer } from '../components/ui/Modal';

function StatusBadge({ status }) {
  const map = { active: 'badge-active', pending: 'badge-pending', suspended: 'badge-suspended' };
  return <span className={`badge ${map[status] || 'badge-expired'}`}>{status}</span>;
}

const TABS = ['all', 'pending', 'active', 'suspended'];

function fmt(n) { return `£${Number(n || 0).toFixed(2)}`; }

function BusinessDrawer({ id, onClose, onAction }) {
  const [data, setData]     = useState(null);
  const [profitData, setProfitData] = useState(null);
  const [hoursData, setHoursData] = useState(null);
  const [loading, setLoading] = useState(true);

  const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  useEffect(() => {
    Promise.all([
      getBusiness(id),
      getBusinessProfit(id).catch(() => null),
      getBusinessHoursAdmin(id),
    ])
      .then(([biz, profit, hours]) => { setData(biz); setProfitData(profit?.offers || null); setHoursData(hours); })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <Drawer title="Business details" onClose={onClose}>
      <LoadingBlock label="Loading…" />
    </Drawer>
  );
  if (!data) return (
    <Drawer title="Business details" onClose={onClose}>
      <div className="form-error-box">Failed to load business.</div>
    </Drawer>
  );

  const { business, offers = [], recentRedemptions = [] } = data;

  return (
    <Drawer title={business.name} onClose={onClose}>
      {/* Info */}
      <div>
        <div className="drawer-section-title">Business info</div>
        <div className="kv-grid">
          <span className="kv-key">Status</span>
          <span className="kv-value"><StatusBadge status={business.status} /></span>
          <span className="kv-key">Category</span>
          <span className="kv-value">{business.category || '—'}</span>
          <span className="kv-key">Owner email</span>
          <span className="kv-value kv-mono">{business.ownerEmail}</span>
          <span className="kv-key">Address</span>
          <span className="kv-value">{[business.address, business.city].filter(Boolean).join(', ') || '—'}</span>
          <span className="kv-key">Phone</span>
          <span className="kv-value">{business.phone || '—'}</span>
          <span className="kv-key">Website</span>
          <span className="kv-value">{business.website || '—'}</span>
          <span className="kv-key">Joined</span>
          <span className="kv-value">{business.createdAt ? format(new Date(business.createdAt), 'dd MMM yyyy') : '—'}</span>
        </div>
        {business.description && (
          <p style={{ marginTop: 12, fontSize: '0.78rem', color: 'var(--c-text-muted)', lineHeight: 1.6 }}>{business.description}</p>
        )}
      </div>

      {/* Opening hours */}
      <div>
        <div className="drawer-section-title">Opening hours</div>
        {hoursData?.status ? (
          <div style={{ marginBottom: 8, fontSize: '0.82rem' }}>
            Currently: <strong style={{ color: hoursData.status.isOpen ? '#16a34a' : '#dc2626' }}>
              {hoursData.status.isOpen ? 'OPEN' : 'CLOSED'}
            </strong>
            {!hoursData.status.isOpen && hoursData.status.nextOpenTime && (
              <span style={{ color: 'var(--c-text-muted)' }}> — opens {hoursData.status.nextOpenTime}</span>
            )}
          </div>
        ) : (
          <div style={{ fontSize: '0.78rem', color: '#d97706', marginBottom: 8 }}>Hours not configured</div>
        )}
        {hoursData?.hours?.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '50px 1fr', gap: '4px 10px', fontSize: '0.78rem' }}>
            {[1,2,3,4,5,6,0].map(d => {
              const h = hoursData.hours.find(r => r.day_of_week === d);
              return (
                <React.Fragment key={d}>
                  <span style={{ fontWeight: 500, color: 'var(--c-text-muted)' }}>{DAYS[d]}</span>
                  <span>{h ? (h.is_closed ? 'Closed' : `${h.opens_at} – ${h.closes_at}`) : '—'}</span>
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8 }}>
        {business.status === 'pending' && (
          <button className="btn btn-success btn-sm" onClick={() => onAction('approve', business.id)}>
            ✓ Approve
          </button>
        )}
        {business.status !== 'suspended' && (
          <button className="btn btn-danger btn-sm" onClick={() => onAction('suspend', business.id)}>
            Suspend
          </button>
        )}
        {business.status === 'suspended' && (
          <button className="btn btn-success btn-sm" onClick={() => onAction('approve', business.id)}>
            Reinstate
          </button>
        )}
      </div>

      {/* Offers */}
      <div>
        <div className="drawer-section-title">Offers ({offers.length})</div>
        {offers.length === 0
          ? <div style={{ fontSize: '0.78rem', color: 'var(--c-text-muted)' }}>No offers yet.</div>
          : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Title</th><th>Status</th><th>Views</th><th>Claimed</th><th>Redeemed</th></tr></thead>
                <tbody>
                  {offers.map((o) => (
                    <tr key={o.id}>
                      <td style={{ fontWeight: 500 }}>{o.title}</td>
                      <td><StatusBadge status={o.status} /></td>
                      <td className="table-mono">{o.viewCount ?? 0}</td>
                      <td className="table-mono">{o.claimedCount  ?? 0}</td>
                      <td className="table-mono">{o.redeemedCount ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>

      {/* Recent redemptions */}
      {recentRedemptions.length > 0 && (
        <div>
          <div className="drawer-section-title">Recent redemptions</div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Code</th><th>Offer</th><th>Date</th></tr></thead>
              <tbody>
                {recentRedemptions.map((r) => (
                  <tr key={r.id}>
                    <td className="table-mono">{r.code}</td>
                    <td>{r.offerTitle}</td>
                    <td style={{ fontSize: '0.76rem', color: 'var(--c-text-muted)' }}>
                      {r.redeemedAt ? format(new Date(r.redeemedAt), 'dd MMM, HH:mm') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {/* Sales & Profit */}
      {profitData && profitData.length > 0 && (() => {
        const totals = profitData.reduce((a, o) => {
          a.redemptions += o.redemptions;
          if (o.has_pricing) { a.revenue += o.revenue; a.cost += o.cost; a.profit += o.gross_profit; }
          return a;
        }, { redemptions: 0, revenue: 0, cost: 0, profit: 0 });
        return (
          <div>
            <div className="drawer-section-title">Sales & Profit</div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Offer</th><th style={{ textAlign: 'right' }}>Redeemed</th><th style={{ textAlign: 'right' }}>Revenue</th><th style={{ textAlign: 'right' }}>Cost</th><th style={{ textAlign: 'right' }}>Profit</th><th>Status</th></tr></thead>
                <tbody>
                  {profitData.map(o => (
                    <tr key={o.id}>
                      <td style={{ fontWeight: 500 }}>{o.title}</td>
                      <td className="table-mono" style={{ textAlign: 'right' }}>{o.redemptions}</td>
                      <td className="table-mono" style={{ textAlign: 'right' }}>{o.has_pricing ? fmt(o.revenue) : '—'}</td>
                      <td className="table-mono" style={{ textAlign: 'right' }}>{o.has_pricing ? fmt(o.cost) : '—'}</td>
                      <td className="table-mono" style={{ textAlign: 'right', color: 'var(--c-accent)', fontWeight: 600 }}>{o.has_pricing ? fmt(o.gross_profit) : '—'}</td>
                      <td><StatusBadge status={o.is_active ? 'active' : 'inactive'} /></td>
                    </tr>
                  ))}
                  <tr style={{ background: 'rgba(255,255,255,0.04)', fontWeight: 700 }}>
                    <td>Total</td>
                    <td style={{ textAlign: 'right' }}>{totals.redemptions}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(totals.revenue)}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(totals.cost)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--c-accent)' }}>{fmt(totals.profit)}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}
    </Drawer>
  );
}

export default function Businesses() {
  const { addToast } = useToast();

  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [tab, setTab]               = useState('all');
  const [search, setSearch]         = useState('');

  const [drawerBizId, setDrawerBizId] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null); // { type, id, name }
  const [suspendReason, setSuspendReason] = useState('');
  const [acting, setActing]         = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    getBusinesses()
      .then((d) => setBusinesses(d.businesses || d))
      .catch(() => addToast('Failed to load businesses.', 'error'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const filtered = businesses.filter((b) => {
    const matchTab = tab === 'all' || b.status === tab;
    const q = search.toLowerCase();
    const matchSearch = !q || b.name?.toLowerCase().includes(q) || b.owner_email?.toLowerCase().includes(q);
    return matchTab && matchSearch;
  }).sort((a, b) => {
    if (a.status === 'pending' && b.status !== 'pending') return -1;
    if (b.status === 'pending' && a.status !== 'pending') return 1;
    return 0;
  });

  async function doAction() {
    if (!confirmAction) return;
    setActing(true);
    try {
      if (confirmAction.type === 'approve') {
        await approveBusiness(confirmAction.id);
        addToast(`${confirmAction.name} approved.`, 'success');
      } else {
        await suspendBusiness(confirmAction.id, suspendReason);
        addToast(`${confirmAction.name} suspended.`, 'info');
      }
      setConfirmAction(null); setSuspendReason('');
      setDrawerBizId(null);
      load();
    } catch {
      addToast('Action failed.', 'error');
    } finally { setActing(false); }
  }

  function openAction(type, id, name) {
    setSuspendReason('');
    setConfirmAction({ type, id, name });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      <div className="page-header">
        <div>
          <div className="page-title">Businesses</div>
          <div className="page-sub">{businesses.length} registered</div>
        </div>
      </div>

      <div className="card">
        {/* Tab + search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, borderBottom: '1px solid var(--c-border)', flexWrap: 'wrap' }}>
          <div className="tab-bar" style={{ flex: 1, border: 'none' }}>
            {TABS.map((t) => {
              const cnt = t === 'all' ? businesses.length : businesses.filter((b) => b.status === t).length;
              return (
                <button key={t} className={`tab-btn ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                  {cnt > 0 && <span className="tab-count">{cnt}</span>}
                </button>
              );
            })}
          </div>
          <div style={{ padding: '8px 14px' }}>
            <input
              className="input search"
              style={{ fontSize: '0.78rem', padding: '6px 10px', width: 220 }}
              placeholder="Search name or email…"
              value={search} onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <LoadingBlock label="Loading businesses…" />
        ) : filtered.length === 0 ? (
          <div className="empty-state"><div className="empty-icon">🏪</div>No businesses found.</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Business</th>
                  <th>Category</th>
                  <th>Owner</th>
                  <th>Joined</th>
                  <th>Active offers</th>
                  <th>Redeemed</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b) => (
                  <tr key={b.id} style={b.status === 'pending' ? { background: 'rgba(217,119,6,0.03)' } : {}}>
                    <td>
                      <span style={{ fontWeight: 600, fontSize: '0.82rem' }}>{b.name}</span>
                      {b.city && <div style={{ fontSize: '0.7rem', color: 'var(--c-text-muted)' }}>{b.city}</div>}
                    </td>
                    <td>{b.category || '—'}</td>
                    <td className="table-mono" style={{ fontSize: '0.74rem' }}>{b.owner_email}</td>
                    <td style={{ fontSize: '0.76rem', color: 'var(--c-text-muted)' }}>
                      {b.created_at ? format(new Date(b.created_at), 'dd MMM yy') : '—'}
                    </td>
                    <td className="table-mono">{b.active_offers ?? 0}</td>
                    <td className="table-mono">{parseInt(b.total_redeemed ?? 0, 10)}</td>
                    <td><StatusBadge status={b.status} /></td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => setDrawerBizId(b.id)}>View</button>
                        {b.status === 'pending' && (
                          <button className="btn btn-success btn-sm" onClick={() => openAction('approve', b.id, b.name)}>Approve</button>
                        )}
                        {b.status !== 'suspended' && b.status !== 'pending' && (
                          <button className="btn btn-danger btn-sm" onClick={() => openAction('suspend', b.id, b.name)}>Suspend</button>
                        )}
                        {b.status === 'suspended' && (
                          <button className="btn btn-success btn-sm" onClick={() => openAction('approve', b.id, b.name)}>Reinstate</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail drawer */}
      {drawerBizId && (
        <BusinessDrawer
          id={drawerBizId}
          onClose={() => setDrawerBizId(null)}
          onAction={openAction}
        />
      )}

      {/* Confirm modal */}
      {confirmAction && (
        <ConfirmModal
          title={confirmAction.type === 'approve' ? `Approve "${confirmAction.name}"?` : `Suspend "${confirmAction.name}"?`}
          message={confirmAction.type === 'approve'
            ? 'This will activate the business account and make their offers visible to users.'
            : 'The business and all their active offers will be hidden from users.'}
          confirmLabel={acting ? 'Processing…' : confirmAction.type === 'approve' ? 'Approve' : 'Suspend'}
          danger={confirmAction.type === 'suspend'}
          onConfirm={doAction}
          onCancel={() => setConfirmAction(null)}
        >
          {confirmAction.type === 'suspend' && (
            <div className="field">
              <label className="label">Reason (optional)</label>
              <textarea className="textarea" rows={2} value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                placeholder="Policy violation, reported content…" />
            </div>
          )}
        </ConfirmModal>
      )}

    </div>
  );
}
