import React, { useEffect, useState } from 'react';
import { listCountries, createCountry, updateCountry, toggleCountry } from '../api/admin';
import { useToast } from '../context/ToastContext';

/**
 * Admin / Countries
 *
 * One row per supported market. Add / edit pricing and active flag.
 * Inactive markets are hidden from registration dropdowns but existing
 * users / businesses keyed to them are unaffected (the FK still
 * resolves; only the public /api/countries list filters by is_active).
 */
export default function Countries() {
  const { toast } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);   // code currently in edit mode
  const [edits, setEdits]     = useState({});     // staged edits for the row in edit mode
  const [adding, setAdding]   = useState(false);
  const [newRow, setNewRow]   = useState({
    name: '', code: '', currency_code: '', currency_symbol: '',
    monthly_price: '', is_active: true,
  });

  useEffect(() => { reload(); }, []);
  async function reload() {
    try {
      const r = await listCountries();
      setRows(r.countries || []);
    } catch (e) {
      toast({ message: e.response?.data?.message || 'Failed to load countries.', type: 'error' });
    } finally {
      setLoading(false);
    }
  }

  function startEdit(c) {
    setEditing(c.code);
    setEdits({
      name:            c.name,
      currency_code:   c.currency_code,
      currency_symbol: c.currency_symbol,
      monthly_price:   c.monthly_price,
      stripe_price_id: c.stripe_price_id || '',
    });
  }
  function cancelEdit() { setEditing(null); setEdits({}); }

  async function save(code) {
    try {
      const r = await updateCountry(code, {
        name:            edits.name,
        currency_code:   edits.currency_code,
        currency_symbol: edits.currency_symbol,
        monthly_price:   parseFloat(edits.monthly_price),
        stripe_price_id: edits.stripe_price_id || null,
      });
      setRows((prev) => prev.map((c) => (c.code === code ? r.country : c)));
      setEditing(null);
      toast({ message: 'Country updated.', type: 'success' });
    } catch (e) {
      toast({ message: e.response?.data?.message || 'Failed to update.', type: 'error' });
    }
  }

  async function toggle(code) {
    try {
      const r = await toggleCountry(code);
      setRows((prev) => prev.map((c) => (c.code === code ? { ...c, is_active: r.is_active } : c)));
    } catch (e) {
      toast({ message: e.response?.data?.message || 'Failed to toggle.', type: 'error' });
    }
  }

  async function add() {
    try {
      const r = await createCountry({
        name:            newRow.name,
        code:            newRow.code.toUpperCase(),
        currency_code:   newRow.currency_code.toUpperCase(),
        currency_symbol: newRow.currency_symbol,
        monthly_price:   parseFloat(newRow.monthly_price),
        is_active:       !!newRow.is_active,
      });
      setRows((prev) => [...prev, r.country].sort((a, b) => a.name.localeCompare(b.name)));
      setAdding(false);
      setNewRow({ name: '', code: '', currency_code: '', currency_symbol: '', monthly_price: '', is_active: true });
      toast({ message: 'Country added.', type: 'success' });
    } catch (e) {
      toast({ message: e.response?.data?.message || 'Failed to add country.', type: 'error' });
    }
  }

  if (loading) return <div>Loading countries…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>Countries / Markets</h2>
        <span style={{ color: 'var(--c-text-muted)', fontSize: '0.85rem' }}>
          Pricing changes apply to new signups only. Toggling inactive hides a market from registration dropdowns; existing accounts are unaffected.
        </span>
        <button
          className="btn btn-primary"
          onClick={() => setAdding((v) => !v)}
          style={{ marginLeft: 'auto' }}
        >
          {adding ? 'Cancel' : '+ Add country'}
        </button>
      </div>

      {adding && (
        <div className="card">
          <div className="card-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr) auto', gap: 8, alignItems: 'end' }}>
            <Field label="Name">
              <input className="input" value={newRow.name} onChange={(e) => setNewRow({ ...newRow, name: e.target.value })} placeholder="Country name" />
            </Field>
            <Field label="Code">
              <input className="input" maxLength={2} value={newRow.code} onChange={(e) => setNewRow({ ...newRow, code: e.target.value.toUpperCase() })} placeholder="GB" />
            </Field>
            <Field label="Currency">
              <input className="input" maxLength={3} value={newRow.currency_code} onChange={(e) => setNewRow({ ...newRow, currency_code: e.target.value.toUpperCase() })} placeholder="GBP" />
            </Field>
            <Field label="Symbol">
              <input className="input" maxLength={5} value={newRow.currency_symbol} onChange={(e) => setNewRow({ ...newRow, currency_symbol: e.target.value })} placeholder="£" />
            </Field>
            <Field label="Price /mo">
              <input className="input" type="number" min="0" step="0.01" value={newRow.monthly_price} onChange={(e) => setNewRow({ ...newRow, monthly_price: e.target.value })} placeholder="20.00" />
            </Field>
            <Field label="Active">
              <input type="checkbox" checked={newRow.is_active} onChange={(e) => setNewRow({ ...newRow, is_active: e.target.checked })} style={{ width: 20, height: 20 }} />
            </Field>
            <button className="btn btn-primary" onClick={add}>Save</button>
          </div>
        </div>
      )}

      <div className="card">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--c-border, rgba(0,0,0,0.08))' }}>
                <Th>Name</Th>
                <Th>Code</Th>
                <Th>Currency</Th>
                <Th>Symbol</Th>
                <Th align="right">Price</Th>
                <Th>Stripe Price ID</Th>
                <Th>Active</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const isEditing = editing === c.code;
                return (
                  <tr key={c.code} style={{ borderBottom: '1px solid var(--c-border, rgba(0,0,0,0.04))' }}>
                    <Td>{isEditing ? <input className="input" value={edits.name} onChange={(e) => setEdits({ ...edits, name: e.target.value })} /> : c.name}</Td>
                    <Td><code>{c.code}</code></Td>
                    <Td>{isEditing ? <input className="input" maxLength={3} value={edits.currency_code} onChange={(e) => setEdits({ ...edits, currency_code: e.target.value.toUpperCase() })} /> : c.currency_code}</Td>
                    <Td>{isEditing ? <input className="input" maxLength={5} value={edits.currency_symbol} onChange={(e) => setEdits({ ...edits, currency_symbol: e.target.value })} /> : c.currency_symbol}</Td>
                    <Td align="right">
                      {isEditing
                        ? <input className="input" type="number" min="0" step="0.01" value={edits.monthly_price} onChange={(e) => setEdits({ ...edits, monthly_price: e.target.value })} />
                        : `${c.currency_symbol}${Number(c.monthly_price).toFixed(2)}`}
                    </Td>
                    <Td>{isEditing
                      ? <input className="input" maxLength={100} value={edits.stripe_price_id} onChange={(e) => setEdits({ ...edits, stripe_price_id: e.target.value })} placeholder="price_…" />
                      : (c.stripe_price_id || <span style={{ color: 'var(--c-text-muted)' }}>—</span>)}</Td>
                    <Td>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => toggle(c.code)}
                        style={{ color: c.is_active ? '#16a34a' : '#9ca3af' }}
                      >
                        {c.is_active ? '✓ Active' : '○ Inactive'}
                      </button>
                    </Td>
                    <Td>
                      {isEditing ? (
                        <>
                          <button className="btn btn-primary btn-sm" onClick={() => save(c.code)}>Save</button>{' '}
                          <button className="btn btn-ghost btn-sm" onClick={cancelEdit}>Cancel</button>
                        </>
                      ) : (
                        <button className="btn btn-ghost btn-sm" onClick={() => startEdit(c)}>Edit</button>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: '0.72rem', color: 'var(--c-text-muted)', fontWeight: 600, letterSpacing: 0.5, marginBottom: 2 }}>
        {label.toUpperCase()}
      </div>
      {children}
    </div>
  );
}

function Th({ children, align = 'left' }) {
  return <th style={{ textAlign: align, padding: '10px 12px', fontWeight: 600, color: 'var(--c-text-muted)' }}>{children}</th>;
}

function Td({ children, align = 'left' }) {
  return <td style={{ textAlign: align, padding: '8px 12px' }}>{children}</td>;
}
