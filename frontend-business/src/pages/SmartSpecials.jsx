import React, { useEffect, useState } from 'react';
import { getInventory, addInventoryItem, removeInventoryItem } from '../api/business';
import { useToast } from '../context/ToastContext';
import { Spinner } from '../components/ui/Spinner';

export default function SmartSpecials() {
  const { toast } = useToast();
  const [items, setItems]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [name, setName]         = useState('');
  const [category, setCategory] = useState('');
  const [perishable, setPerishable] = useState(true);
  const [adding, setAdding]     = useState(false);

  function load() {
    setLoading(true);
    getInventory()
      .then((d) => setItems(d.items || []))
      .catch(() => toast({ message: 'Failed to load inventory.', type: 'error' }))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleAdd(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setAdding(true);
    try {
      await addInventoryItem({ name: name.trim(), category: category.trim() || null, is_perishable: perishable });
      setName(''); setCategory(''); setPerishable(true);
      toast({ message: 'Item added.', type: 'success' });
      load();
    } catch { toast({ message: 'Failed to add item.', type: 'error' }); }
    setAdding(false);
  }

  async function handleRemove(id) {
    try {
      await removeInventoryItem(id);
      toast({ message: 'Item removed.', type: 'success' });
      load();
    } catch { toast({ message: 'Failed to remove item.', type: 'error' }); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>Smart Specials</h2>
        <p style={{ color: 'var(--c-text-muted)', fontSize: '0.88rem', marginTop: 4 }}>
          Manage your inventory items. When you take a photo of your stock, Smart Specials matches items and suggests discounts for perishables.
        </p>
      </div>

      <div className="card">
        <div className="card-header"><span className="card-title">Add inventory item</span></div>
        <div className="card-body">
          <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="form-grid">
              <div className="field">
                <label className="label label-required">Item name</label>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sourdough loaf" required />
              </div>
              <div className="field">
                <label className="label">Category</label>
                <input className="input" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Bakery" />
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.88rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={perishable} onChange={(e) => setPerishable(e.target.checked)} />
              Perishable item (flagged for freshness discounts)
            </label>
            <button className="btn btn-primary" type="submit" disabled={adding} style={{ alignSelf: 'flex-start' }}>
              {adding ? <Spinner white /> : 'Add item'}
            </button>
          </form>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><span className="card-title">Your inventory ({items.length} items)</span></div>
        <div className="card-body">
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><Spinner /></div>
          ) : items.length === 0 ? (
            <p style={{ color: 'var(--c-text-muted)', textAlign: 'center', padding: 24, fontSize: '0.88rem' }}>
              No items yet. Add your stock items above to enable Smart Specials.
            </p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Name</th><th>Category</th><th>Perishable</th><th></th></tr></thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td style={{ fontWeight: 500 }}>{item.name}</td>
                      <td style={{ color: 'var(--c-text-muted)' }}>{item.category || '—'}</td>
                      <td>{item.is_perishable ? <span className="badge badge-active">Yes</span> : <span className="badge badge-expired">No</span>}</td>
                      <td>
                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--c-danger)' }} onClick={() => handleRemove(item.id)}>Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
