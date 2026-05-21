import React, { useEffect, useState } from 'react';
import { getInventory, addInventoryItem, updateInventoryItem, removeInventoryItem } from '../api/business';
import { resolveImageUrl } from '../utils/imageUrl';
import { useToast } from '../context/ToastContext';
import { Spinner } from '../components/ui/Spinner';
import { FileDropzone } from '../components/ui/FileDropzone';

export default function SmartSpecials() {
  const { toast } = useToast();
  const [items, setItems]       = useState([]);
  const [stats, setStats]       = useState({});
  const [loading, setLoading]   = useState(true);
  const [showAdd, setShowAdd]   = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [filter, setFilter]     = useState('all');
  const [search, setSearch]     = useState('');

  function load() {
    setLoading(true);
    getInventory()
      .then((d) => { setItems(d.items || []); setStats(d.stats || {}); })
      .catch(() => toast({ message: 'Failed to load inventory.', type: 'error' }))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleRemove(id) {
    if (!window.confirm('Remove this product?')) return;
    try {
      await removeInventoryItem(id);
      toast({ message: 'Product removed.', type: 'success' });
      load();
    } catch { toast({ message: 'Failed to remove.', type: 'error' }); }
  }

  const filtered = items.filter(item => {
    if (filter === 'low_stock' && item.stock_level > (item.low_stock_threshold || 5)) return false;
    if (filter === 'out_of_stock' && (item.stock_level || 0) > 0) return false;
    if (filter === 'perishable' && !item.is_perishable) return false;
    if (search && !item.name.toLowerCase().includes(search.toLowerCase()) && !(item.sku || '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>Product Catalog</h2>
          <p style={{ color: 'var(--c-text-muted)', fontSize: '0.88rem', marginTop: 4 }}>
            Manage your inventory for Smart Specials and Shopping Intent matching.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => { setShowAdd(!showAdd); setEditItem(null); }}>
          {showAdd ? 'Cancel' : '+ Add product'}
        </button>
      </div>

      {/* Stats cards */}
      <div className="stats-grid">
        <div className="stat-card" onClick={() => setFilter('all')} style={{ cursor: 'pointer' }}>
          <div className="stat-label">Total Products</div>
          <div className="stat-value">{stats.total || 0}</div>
        </div>
        <div className="stat-card" onClick={() => setFilter('all')} style={{ cursor: 'pointer' }}>
          <div className="stat-label">In Stock</div>
          <div className="stat-value" style={{ color: '#16A34A' }}>{stats.in_stock || 0}</div>
        </div>
        <div className="stat-card" onClick={() => setFilter('low_stock')} style={{ cursor: 'pointer', border: filter === 'low_stock' ? '2px solid var(--c-primary)' : undefined }}>
          <div className="stat-label">Low Stock</div>
          <div className="stat-value" style={{ color: '#EAB308' }}>{stats.low_stock || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Categories</div>
          <div className="stat-value">{stats.categories || 0}</div>
        </div>
      </div>

      {/* Add/Edit form */}
      {(showAdd || editItem) && (
        <ProductForm
          initial={editItem}
          onSave={() => { setShowAdd(false); setEditItem(null); load(); }}
          onCancel={() => { setShowAdd(false); setEditItem(null); }}
        />
      )}

      {/* Search + filters */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="input" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or SKU..." style={{ maxWidth: 280 }} />
        <div style={{ display: 'flex', gap: 4 }}>
          {[
            { key: 'all', label: 'All' },
            { key: 'low_stock', label: 'Low stock' },
            { key: 'out_of_stock', label: 'Out of stock' },
            { key: 'perishable', label: 'Perishable' },
          ].map(f => (
            <button key={f.key} className={`btn btn-sm ${filter === f.key ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilter(f.key)}>{f.label}</button>
          ))}
        </div>
      </div>

      {/* Product table */}
      <div className="card">
        <div className="card-body">
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><Spinner /></div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--c-text-muted)', padding: 48, fontSize: '0.88rem' }}>
              {items.length === 0 ? 'No products yet. Add your first product above.' : 'No products match your filter.'}
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th></th>
                    <th>Product</th>
                    <th>SKU</th>
                    <th>Category</th>
                    <th>Price</th>
                    <th>Stock</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(item => {
                    const stockStatus = (item.stock_level || 0) === 0 ? 'out' : item.stock_level <= (item.low_stock_threshold || 5) ? 'low' : 'ok';
                    return (
                      <tr key={item.id}>
                        <td style={{ width: 48 }}>
                          {item.image_url ? (
                            <img src={resolveImageUrl(item.image_url)} alt="" style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover' }} />
                          ) : (
                            <div style={{ width: 40, height: 40, borderRadius: 6, background: 'var(--c-bg-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem' }}>📦</div>
                          )}
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{item.name}</div>
                          {item.is_perishable && <span style={{ fontSize: '0.68rem', color: 'var(--c-primary)', fontWeight: 600 }}>PERISHABLE</span>}
                        </td>
                        <td style={{ fontSize: '0.82rem', color: 'var(--c-text-muted)', fontFamily: 'var(--f-mono, monospace)' }}>{item.sku || '—'}</td>
                        <td style={{ fontSize: '0.82rem', color: 'var(--c-text-muted)' }}>{item.category || '—'}</td>
                        <td style={{ fontWeight: 600 }}>{item.price ? `£${parseFloat(item.price).toFixed(2)}` : '—'}</td>
                        <td style={{ fontWeight: 600 }}>{item.stock_level ?? 0}</td>
                        <td>
                          <span className={`badge ${stockStatus === 'ok' ? 'badge-active' : stockStatus === 'low' ? 'badge-scheduled' : 'badge-expired'}`}>
                            {stockStatus === 'ok' ? 'In stock' : stockStatus === 'low' ? 'Low' : 'Out'}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => { setEditItem(item); setShowAdd(false); }}>Edit</button>
                            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--c-danger)' }} onClick={() => handleRemove(item.id)}>Remove</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProductForm({ initial, onSave, onCancel }) {
  const { toast } = useToast();
  const isEdit = !!initial?.id;
  const [name, setName]           = useState(initial?.name || '');
  const [category, setCategory]   = useState(initial?.category || '');
  const [sku, setSku]             = useState(initial?.sku || '');
  const [barcode, setBarcode]     = useState(initial?.barcode || '');
  const [price, setPrice]         = useState(initial?.price ? String(initial.price) : '');
  const [costPrice, setCostPrice] = useState(initial?.cost_price ? String(initial.cost_price) : '');
  const [stockLevel, setStockLevel] = useState(initial?.stock_level != null ? String(initial.stock_level) : '0');
  const [threshold, setThreshold]   = useState(initial?.low_stock_threshold != null ? String(initial.low_stock_threshold) : '5');
  const [perishable, setPerishable] = useState(initial?.is_perishable ?? false);
  const [description, setDesc]    = useState(initial?.description || '');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(initial?.image_url ? resolveImageUrl(initial.image_url) : '');
  const [saving, setSaving]       = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('name', name.trim());
      if (category) fd.append('category', category.trim());
      fd.append('is_perishable', perishable);
      if (sku) fd.append('sku', sku.trim());
      if (barcode) fd.append('barcode', barcode.trim());
      if (price) fd.append('price', price);
      if (costPrice) fd.append('cost_price', costPrice);
      fd.append('stock_level', stockLevel || '0');
      fd.append('low_stock_threshold', threshold || '5');
      if (description) fd.append('description', description.trim());
      if (imageFile) fd.append('image', imageFile);

      if (isEdit) await updateInventoryItem(initial.id, fd);
      else await addInventoryItem(fd);

      toast({ message: isEdit ? 'Product updated.' : 'Product added.', type: 'success' });
      onSave();
    } catch (err) {
      toast({ message: err.response?.data?.message || 'Failed to save product.', type: 'error' });
    }
    setSaving(false);
  }

  return (
    <div className="card">
      <div className="card-header"><span className="card-title">{isEdit ? 'Edit product' : 'Add product'}</span></div>
      <div className="card-body">
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-grid">
            <div className="field">
              <label className="label label-required">Product name</label>
              <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Sourdough loaf" required />
            </div>
            <div className="field">
              <label className="label">Category</label>
              <input className="input" value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Bakery" />
            </div>
          </div>
          <div className="form-grid">
            <div className="field">
              <label className="label">SKU</label>
              <input className="input" value={sku} onChange={e => setSku(e.target.value)} placeholder="e.g. BRD-SOUR-001" />
            </div>
            <div className="field">
              <label className="label">Barcode</label>
              <input className="input" value={barcode} onChange={e => setBarcode(e.target.value)} placeholder="e.g. 5012345678901" />
            </div>
          </div>
          <div className="form-grid">
            <div className="field">
              <label className="label">Price (GBP)</label>
              <input className="input" type="number" min="0" step="0.01" value={price} onChange={e => setPrice(e.target.value)} placeholder="3.50" />
            </div>
            <div className="field">
              <label className="label">Cost price (GBP)</label>
              <input className="input" type="number" min="0" step="0.01" value={costPrice} onChange={e => setCostPrice(e.target.value)} placeholder="1.20" />
            </div>
          </div>
          <div className="form-grid">
            <div className="field">
              <label className="label">Stock level</label>
              <input className="input" type="number" min="0" value={stockLevel} onChange={e => setStockLevel(e.target.value)} />
            </div>
            <div className="field">
              <label className="label">Low stock alert at</label>
              <input className="input" type="number" min="0" value={threshold} onChange={e => setThreshold(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label className="label">Description</label>
            <textarea className="textarea" value={description} onChange={e => setDesc(e.target.value)} rows={2} placeholder="Optional product details..." />
          </div>
          <div className="field">
            <label className="label">Product image</label>
            <FileDropzone label="Drop a photo" hint="Square recommended · PNG, JPG"
              onFile={f => { setImageFile(f); setImagePreview(URL.createObjectURL(f)); }}
              preview={imagePreview} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.88rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={perishable} onChange={e => setPerishable(e.target.checked)} />
            Perishable item (triggers Smart Specials freshness alerts)
          </label>
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button className="btn btn-secondary" type="button" onClick={onCancel}>Cancel</button>
            <button className="btn btn-primary" type="submit" style={{ flex: 1 }} disabled={saving}>
              {saving ? <Spinner white /> : (isEdit ? 'Save changes' : 'Add product')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
