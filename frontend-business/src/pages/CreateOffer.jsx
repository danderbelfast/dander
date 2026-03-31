import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createOffer } from '../api/business';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { FileDropzone } from '../components/ui/FileDropzone';
import { Spinner } from '../components/ui/Spinner';
import { OfferPreviewCard } from '../components/ui/OfferPreviewCard';
import { RadiusMapPicker } from '../components/ui/RadiusMapPicker';

const CATEGORIES = ['Food & Drink', 'Beauty & Wellness', 'Health & Fitness', 'Entertainment', 'Retail & Shopping', 'Services', 'Experiences & Leisure', 'Other'];
const ICON_COLOURS = [
  { value: '#000000', label: 'Black' },
  { value: '#ffffff', label: 'White' },
  { value: '#ef4444', label: 'Red' },
  { value: '#f97316', label: 'Orange' },
  { value: '#eab308', label: 'Yellow' },
  { value: '#22c55e', label: 'Green' },
  { value: '#3b82f6', label: 'Blue' },
  { value: '#8b5cf6', label: 'Purple' },
  { value: '#ec4899', label: 'Pink' },
];
const DISCOUNT_TYPES = [
  { value: 'percentage', label: 'Percentage off' },
  { value: 'fixed',      label: 'Fixed amount off' },
  { value: 'bogo',       label: 'Buy one get one' },
  { value: 'free_item',  label: 'Free item' },
  { value: 'custom',     label: 'Custom (describe below)' },
];

function toLocalDatetimeValue(date) {
  if (!date) return '';
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export default function CreateOffer() {
  const navigate = useNavigate();
  const { business } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  // Core fields
  const [title, setTitle]             = useState('');
  const [description, setDesc]        = useState('');
  const [category, setCategory]       = useState('');
  const [discountType, setDiscountType] = useState('percentage');
  const [discountValue, setDiscountValue] = useState('');
  const [originalPrice, setOriginalPrice] = useState('');
  const [termsText, setTermsText]     = useState('');

  // Schedule
  const [startsAt, setStartsAt]       = useState(toLocalDatetimeValue(new Date()));
  const [expiresAt, setExpiresAt]     = useState('');

  // Limits
  const [redemptionCap, setRedemptionCap] = useState('');
  const [perUserLimit, setPerUserLimit]   = useState('1');

  // Geo
  const [radiusMeters, setRadiusMeters] = useState(500);

  // Custom offer description (shown when discountType === 'custom')
  const [customDesc, setCustomDesc]   = useState('');

  // Category icon colour
  const [iconColor, setIconColor]     = useState('#000000');

  // Image
  const [imageFile, setImageFile]     = useState(null);
  const [imagePreview, setImagePreview] = useState('');

  function onImageFile(f) { setImageFile(f); setImagePreview(URL.createObjectURL(f)); }

  // Computed discount string for preview
  const discountLabel = (() => {
    if (discountType === 'percentage' && discountValue) return `${discountValue}% off`;
    if (discountType === 'fixed' && discountValue) return `£${discountValue} off`;
    if (discountType === 'bogo') return 'Buy one get one';
    if (discountType === 'free_item') return 'Free item';
    return discountValue || '';
  })();

  const discountedPrice = (() => {
    const orig = parseFloat(originalPrice);
    if (!orig) return null;
    if (discountType === 'percentage' && discountValue) return (orig * (1 - parseFloat(discountValue) / 100)).toFixed(2);
    if (discountType === 'fixed' && discountValue) return Math.max(0, orig - parseFloat(discountValue)).toFixed(2);
    return null;
  })();

  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const formData = new FormData();
      formData.append('title', title);
      const fullDesc = [description, discountType === 'custom' ? customDesc : ''].filter(Boolean).join('\n\n');
      formData.append('description', fullDesc);
      formData.append('category', category);
      formData.append('offer_type', discountType);
      if (discountValue) formData.append('discount_percent', discountValue);
      if (originalPrice) formData.append('original_price', originalPrice);
      if (termsText)     formData.append('terms', termsText);
      formData.append('starts_at', new Date(startsAt).toISOString());
      if (expiresAt) formData.append('expires_at', new Date(expiresAt).toISOString());
      if (redemptionCap) formData.append('max_redemptions', redemptionCap);
      formData.append('radius_meters', radiusMeters);
      formData.append('icon_color', iconColor);
      if (imageFile) formData.append('image', imageFile);

      await createOffer(formData);
      toast({ message: 'Offer created!', type: 'success' });
      navigate('/offers');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create offer.');
    } finally { setLoading(false); }
  }

  const previewOffer = {
    title: title || 'Offer title',
    description: description || '',
    offer_type: discountType,
    icon_color: iconColor,
    offer_price: discountedPrice || null,
    original_price: originalPrice || null,
    discount_percent: discountType === 'percentage' && discountValue ? discountValue : null,
    custom_desc: discountType === 'custom' ? customDesc : '',
    expiresAt,
    category: category || 'Other',
  };

  return (
    <div className="offer-form-layout">

      {/* ── Left: form ── */}
      <form className="offer-form-col" onSubmit={handleSubmit}>
        <div className="card">
          <div className="card-header"><span className="card-title">Offer details</span></div>
          <div className="card-body">
            {error && <div className="form-error-box">{error}</div>}

            <div className="field">
              <label className="label label-required">Title</label>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. 20% off your first pint" required />
            </div>

            <div className="field">
              <label className="label">Description</label>
              <textarea className="textarea" value={description} onChange={(e) => setDesc(e.target.value)}
                placeholder="Tell customers what's included…" rows={3} />
            </div>

            <div className="form-grid">
              <div className="field">
                <label className="label">Category</label>
                <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="">Select…</option>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="field">
                <label className="label">Discount type</label>
                <select className="select" value={discountType} onChange={(e) => setDiscountType(e.target.value)}>
                  {DISCOUNT_TYPES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </div>
            </div>

            {category && (
              <div className="field">
                <label className="label">Category icon colour</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                  {ICON_COLOURS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      title={c.label}
                      onClick={() => setIconColor(c.value)}
                      style={{
                        width: 32, height: 32, borderRadius: 6,
                        background: c.value,
                        border: iconColor === c.value ? '2.5px solid var(--c-primary)' : '2px solid var(--c-border)',
                        cursor: 'pointer', flexShrink: 0,
                        boxShadow: iconColor === c.value ? '0 0 0 2px white, 0 0 0 4px var(--c-primary)' : 'none',
                      }}
                    />
                  ))}
                </div>
                <div className="field-hint">Shown in the top-left of your offer image. Pick a colour that stands out against your photo.</div>
              </div>
            )}

            {discountType === 'custom' && (
              <div className="field">
                <label className="label">Describe your offer</label>
                <textarea className="textarea" value={customDesc} onChange={(e) => setCustomDesc(e.target.value)}
                  placeholder="e.g. Show this coupon for a free side dish with any main course." rows={2} />
              </div>
            )}

            <div className="form-grid">
              {(discountType === 'percentage' || discountType === 'fixed') && (
                <div className="field">
                  <label className="label label-required">
                    {discountType === 'percentage' ? 'Discount %' : 'Amount off (£)'}
                  </label>
                  <input className="input" type="number" min="0" step="0.01"
                    value={discountValue} onChange={(e) => setDiscountValue(e.target.value)}
                    placeholder={discountType === 'percentage' ? '20' : '5.00'} required />
                </div>
              )}
              <div className="field">
                <label className="label">Original price (£)</label>
                <input className="input" type="number" min="0" step="0.01"
                  value={originalPrice} onChange={(e) => setOriginalPrice(e.target.value)}
                  placeholder="9.99" />
                {discountedPrice && (
                  <div className="field-hint">Discounted price: <strong>£{discountedPrice}</strong></div>
                )}
              </div>
            </div>

            <div style={{ background: 'var(--c-bg-muted)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', padding: '12px 16px', fontSize: '0.85rem', color: 'var(--c-text-muted)', lineHeight: 1.6 }}>
              💡 When a customer claims this offer in the Dander app, the system automatically generates a unique coupon code for them. They show that code at your counter and a staff member enters it — along with their PIN — on the Redeem Coupon page to mark it as used.
            </div>

            <div className="field">
              <label className="label">Terms & conditions</label>
              <textarea className="textarea" value={termsText} onChange={(e) => setTermsText(e.target.value)}
                placeholder="e.g. Valid Monday–Thursday, dine-in only, one per table." rows={2} />
            </div>

            <div className="field">
              <label className="label">Offer image</label>
              <FileDropzone
                label="Drag & drop an image"
                hint="1200 × 630 px recommended · PNG, JPG"
                onFile={onImageFile}
                preview={imagePreview}
              />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><span className="card-title">Schedule & limits</span></div>
          <div className="card-body">
            <div className="form-grid">
              <div className="field">
                <label className="label label-required">Start date & time</label>
                <input className="input" type="datetime-local" value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)} required />
              </div>
              <div className="field">
                <label className="label">Expires at</label>
                <input className="input" type="datetime-local" value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)} min={startsAt} />
              </div>
            </div>
            <div className="form-grid">
              <div className="field">
                <label className="label">Maximum number of coupons</label>
                <input className="input" type="number" min="1" value={redemptionCap}
                  onChange={(e) => setRedemptionCap(e.target.value)} placeholder="Leave blank for unlimited" />
              </div>
              <div className="field">
                <label className="label">Per-user limit</label>
                <input className="input" type="number" min="1" max="99" value={perUserLimit}
                  onChange={(e) => setPerUserLimit(e.target.value)} placeholder="1" />
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><span className="card-title">Visibility radius</span></div>
          <div className="card-body">
            <RadiusMapPicker
              radiusMeters={radiusMeters}
              onChange={setRadiusMeters}
              lat={business?.lat}
              lng={business?.lng}
            />
          </div>
        </div>

        <div className="register-actions" style={{ marginTop: 0 }}>
          <button className="btn btn-secondary" type="button" onClick={() => navigate('/offers')}>Cancel</button>
          <button className="btn btn-primary" type="submit" style={{ flex: 1 }} disabled={loading}>
            {loading ? <Spinner white /> : 'Publish offer'}
          </button>
        </div>
      </form>

      {/* ── Right: live preview ── */}
      <div className="offer-preview-col">
        <div className="offer-preview-sticky">
          <div className="label" style={{ marginBottom: 12, fontWeight: 600 }}>Live preview</div>
          <OfferPreviewCard offer={previewOffer} businessName={business?.name} imagePreview={imagePreview} />
          <p className="field-hint" style={{ marginTop: 10, textAlign: 'center' }}>
            This is how your offer will appear to customers in the Dander app.
          </p>
        </div>
      </div>

    </div>
  );
}
