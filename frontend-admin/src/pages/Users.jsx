import React, { useEffect, useState, useCallback } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { getUsers, suspendUser } from '../api/admin';
import { useToast } from '../context/ToastContext';
import { LoadingBlock } from '../components/ui/Spinner';
import { ConfirmModal, Drawer } from '../components/ui/Modal';

function StatusBadge({ status }) {
  const map = { active: 'badge-active', suspended: 'badge-suspended', pending: 'badge-pending' };
  return <span className={`badge ${map[status] || 'badge-expired'}`}>{status || 'active'}</span>;
}

function UserDrawer({ user, onClose, onSuspend }) {
  return (
    <Drawer title="User profile" onClose={onClose}>
      <div>
        <div className="drawer-section-title">Account details</div>
        <div className="kv-grid">
          <span className="kv-key">Name</span>
          <span className="kv-value">
            {[user.first_name, user.last_name].filter(Boolean).join(' ') || '—'}
          </span>
          <span className="kv-key">Email</span>
          <span className="kv-value kv-mono">{user.email}</span>
          <span className="kv-key">Role</span>
          <span className="kv-value"><span className={`badge ${user.role === 'admin' ? 'badge-admin' : 'badge-expired'}`}>{user.role}</span></span>
          <span className="kv-key">Status</span>
          <span className="kv-value"><StatusBadge status={user.is_active !== false ? 'active' : 'suspended'} /></span>
          <span className="kv-key">Joined</span>
          <span className="kv-value">{user.created_at ? format(new Date(user.created_at), 'dd MMM yyyy') : '—'}</span>
          <span className="kv-key">Last active</span>
          <span className="kv-value">—</span>
          <span className="kv-key">Coupons</span>
          <span className="kv-value kv-mono">{user.total_redeemed ?? 0} redeemed</span>
        </div>
      </div>

      {user.is_active !== false && user.role !== 'admin' && (
        <div>
          <button className="btn btn-danger btn-sm" onClick={() => onSuspend(user)}>
            Suspend this account
          </button>
        </div>
      )}
    </Drawer>
  );
}

export default function Users() {
  const { addToast } = useToast();

  const [users, setUsers]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const PER_PAGE = 50;

  const [selectedUser, setSelectedUser]   = useState(null);
  const [suspendTarget, setSuspendTarget] = useState(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [acting, setActing] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const params = { page, limit: PER_PAGE };
    if (search) params.search = search;
    getUsers(params)
      .then((d) => { setUsers(d.users || d); setTotal(d.total || (d.users || d).length); })
      .catch(() => addToast('Failed to load users.', 'error'))
      .finally(() => setLoading(false));
  }, [search, page]);

  useEffect(load, [load]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setPage(1); load(); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  async function doSuspend() {
    if (!suspendTarget) return;
    setActing(true);
    try {
      await suspendUser(suspendTarget.id, suspendReason);
      addToast(`${suspendTarget.email} suspended.`, 'info');
      setSuspendTarget(null); setSuspendReason('');
      setSelectedUser(null);
      load();
    } catch {
      addToast('Failed to suspend user.', 'error');
    } finally { setActing(false); }
  }

  const pages = Math.ceil(total / PER_PAGE);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      <div className="page-header">
        <div>
          <div className="page-title">Users</div>
          <div className="page-sub">{total} registered users</div>
        </div>
      </div>

      <div className="card">
        {/* Search bar */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--c-border)' }}>
          <input
            className="input"
            style={{ maxWidth: 320, fontSize: '0.78rem', padding: '7px 11px' }}
            placeholder="Search by name or email…"
            value={search} onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <LoadingBlock label="Loading users…" />
        ) : users.length === 0 ? (
          <div className="empty-state"><div className="empty-icon">👤</div>No users found.</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Joined</th>
                  <th>Coupons redeemed</th>
                  <th>Last active</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 500 }}>
                      {[u.first_name, u.last_name].filter(Boolean).join(' ') || '—'}
                    </td>
                    <td className="table-mono" style={{ fontSize: '0.74rem' }}>{u.email}</td>
                    <td>
                      <span className={`badge ${u.role === 'admin' ? 'badge-admin' : u.role === 'business' ? 'badge-scheduled' : 'badge-expired'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.76rem', color: 'var(--c-text-muted)' }}>
                      {u.created_at ? format(new Date(u.created_at), 'dd MMM yy') : '—'}
                    </td>
                    <td className="table-mono">{u.total_redeemed ?? 0}</td>
                    <td style={{ fontSize: '0.74rem', color: 'var(--c-text-muted)' }}>—</td>
                    <td><StatusBadge status={u.is_active !== false ? 'active' : 'suspended'} /></td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => setSelectedUser(u)}>View</button>
                        {u.is_active !== false && u.role !== 'admin' && (
                          <button className="btn btn-danger btn-sm" onClick={() => { setSuspendReason(''); setSuspendTarget(u); }}>
                            Suspend
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

        {/* Pagination */}
        {pages > 1 && (
          <div style={{ display: 'flex', gap: 6, padding: '12px 16px', alignItems: 'center', borderTop: '1px solid var(--c-border)' }}>
            <button className="btn btn-ghost btn-sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
            <span style={{ fontSize: '0.78rem', color: 'var(--c-text-muted)' }}>Page {page} of {pages}</span>
            <button className="btn btn-ghost btn-sm" disabled={page === pages} onClick={() => setPage((p) => p + 1)}>Next →</button>
          </div>
        )}
      </div>

      {/* User detail drawer */}
      {selectedUser && (
        <UserDrawer
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
          onSuspend={(u) => { setSuspendReason(''); setSuspendTarget(u); }}
        />
      )}

      {/* Suspend confirm */}
      {suspendTarget && (
        <ConfirmModal
          title={`Suspend ${suspendTarget.email}?`}
          message="The user will be locked out and their coupons deactivated."
          confirmLabel={acting ? 'Suspending…' : 'Suspend account'}
          danger
          onConfirm={doSuspend}
          onCancel={() => setSuspendTarget(null)}
        >
          <div className="field">
            <label className="label">Reason (optional)</label>
            <textarea className="textarea" rows={2} value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              placeholder="Abuse, fraud, policy violation…" />
          </div>
        </ConfirmModal>
      )}

    </div>
  );
}
