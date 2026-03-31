import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMyOffers, deactivateOffer, duplicateOffer } from '../api/business';
import { useToast } from '../context/ToastContext';
import { Spinner } from '../components/ui/Spinner';

function offerStatus(o) {
  const now = new Date();
  if (!o.is_active) return 'inactive';
  if (o.expires_at && new Date(o.expires_at) <= now) return 'expired';
  if (o.starts_at && new Date(o.starts_at) > now) return 'scheduled';
  return 'active';
}

function StatusBadge({ status }) {
  const map = { active: 'badge-active', scheduled: 'badge-scheduled', expired: 'badge-expired', inactive: 'badge-expired' };
  return <span className={`badge ${map[status] || 'badge-expired'}`}>{status}</span>;
}

const TABS = ['all', 'active', 'scheduled', 'expired'];

export default function MyOffers() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [offers, setOffers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState('all');
  const [acting, setActing]   = useState(null); // offer id being acted on

  function load() {
    setLoading(true);
    getMyOffers()
      .then((data) => setOffers(data.offers || data))
      .catch(() => toast({ message: 'Failed to load offers.', type: 'error' }))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleDeactivate(id) {
    if (!window.confirm('Deactivate this offer? It will no longer be visible to users.')) return;
    setActing(id);
    try {
      await deactivateOffer(id);
      toast({ message: 'Offer deactivated.', type: 'success' });
      load();
    } catch {
      toast({ message: 'Could not deactivate offer.', type: 'error' });
    } finally { setActing(null); }
  }

  async function handleDuplicate(id) {
    setActing(id);
    try {
      await duplicateOffer(id);
      toast({ message: 'Offer duplicated — review and publish it from the list.', type: 'success' });
      load();
    } catch {
      toast({ message: 'Could not duplicate offer.', type: 'error' });
    } finally { setActing(null); }
  }

  const filtered = tab === 'all' ? offers : offers.filter((o) => offerStatus(o) === tab);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--c-heading)', margin: 0 }}>My Offers</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--c-text-muted)', fontSize: '0.88rem' }}>
            {offers.length} offer{offers.length !== 1 ? 's' : ''} total
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/offers/new')}>+ Create offer</button>
      </div>

      {/* Tabs */}
      <div className="tab-bar">
        {TABS.map((t) => {
          const count = t === 'all' ? offers.length : offers.filter((o) => offerStatus(o) === t).length;
          return (
            <button key={t} className={`tab-btn ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
              {count > 0 && <span className="tab-count">{count}</span>}
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div className="card">
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner /></div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--c-text-muted)', padding: '48px 0', fontSize: '0.88rem' }}>
            {tab === 'all'
              ? <>No offers yet. <span style={{ color: 'var(--c-primary)', cursor: 'pointer' }} onClick={() => navigate('/offers/new')}>Create your first →</span></>
              : `No ${tab} offers.`
            }
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Offer</th>
                  <th>Status</th>
                  <th>Views</th>
                  <th>Claimed</th>
                  <th>Redeemed</th>
                  <th>Cap</th>
                  <th>Expires</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{o.title}</div>
                      {o.category && <div style={{ fontSize: '0.78rem', color: 'var(--c-text-muted)', marginTop: 2 }}>{o.category}</div>}
                    </td>
                    <td><StatusBadge status={offerStatus(o)} /></td>
                    <td>{o.view_count ?? 0}</td>
                    <td>{parseInt(o.claimed_count ?? 0, 10)}</td>
                    <td>{parseInt(o.redeemed_count ?? 0, 10)}</td>
                    <td>{o.max_redemptions ?? <span style={{ color: 'var(--c-text-muted)' }}>∞</span>}</td>
                    <td style={{ fontSize: '0.82rem', color: 'var(--c-text-muted)' }}>
                      {o.expires_at
                        ? new Date(o.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })
                        : '—'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/offers/${o.id}/stats`)}>
                          Stats
                        </button>
                        {offerStatus(o) !== 'expired' && offerStatus(o) !== 'inactive' && (
                          <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/offers/${o.id}/edit`)}>
                            Edit
                          </button>
                        )}
                        <button className="btn btn-ghost btn-sm" onClick={() => handleDuplicate(o.id)} disabled={acting === o.id}>
                          {acting === o.id ? <Spinner /> : 'Duplicate'}
                        </button>
                        {offerStatus(o) === 'active' && (
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ color: 'var(--c-danger, #c0392b)' }}
                            onClick={() => handleDeactivate(o.id)}
                            disabled={acting === o.id}
                          >
                            Deactivate
                          </button>
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

    </div>
  );
}
