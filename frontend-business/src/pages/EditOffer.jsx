import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getOffer, updateOffer } from '../api/business';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { FileDropzone } from '../components/ui/FileDropzone';
import { resolveImageUrl } from '../utils/imageUrl';
import { Spinner } from '../components/ui/Spinner';
import { OfferPreviewCard } from '../components/ui/OfferPreviewCard';
import { RadiusMapPicker } from '../components/ui/RadiusMapPicker';
import { LoadingBlock } from '../components/ui/Spinner';

const CATEGORIES = ['Food & Drink', 'Beauty & Wellness', 'Health & Fitness', 'Entertainment', 'Retail & Shopping', 'Services', 'Experiences & Leisure', 'Other'];
const DISCOUNT_TYPES = [
  { value: 'percentage', label: 'Percentage off' },
  { value: 'fixed',      label: 'Fixed amount off' },
  { value: 'bogo',       label: 'Buy one get one' },
  { value: 'free_item',  label: 'Free item' },
  { value: 'custom',     label: 'Custom (describe below)' },
];

function toLocalDatetimeValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export default function EditOffer() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { business } = useAuth();
  const { toast } = useToast();

  const [fetching, setFetching]   = useState(true);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [fetchError, setFetchError] = useState('');

  const [title, setTitle]               = useState('');
  const [description, setDesc]          = useState('');
  const [category, setCategory]         = useState('');
  const [discountType, setDiscountType] = useState('percentage');
  const [discountValue, setDiscountValue] = useState('');
  const [originalPrice, setOriginalPrice] = useState('');
  const [termsText, setTermsText]       = useState('');
  const [startsAt, setStartsAt]         = useState('');
  const [expiresAt, setExpiresAt]       = useState('');
  const [redemptionCap, setRedemptionCap] = useState('');
  const [perUserLimit, setPerUserLimit]   = useState('1');
  const [radiusMeters, setRadiusMeters]   = useState(500);
  const [showWhenClosed, setShowWhenClosed] = useState(false);
  const [showCountdown, setShowCountdown]   = useState(true);
  const [costPrice, setCostPrice]         = useState('');
  const [sellingPrice, setSellingPrice]   = useState('');
  const [imageFile, setImageFile]         = useState(null);
  const [imagePreview, setImagePreview]   = useState('');
  const [existingImageUrl, setExistingImageUrl] = useState('');

  useEffect(() => {
    getOffer(id)
      .then(({ offer }) => {
        setTitle(offer.title || '');
        setDesc(offer.description || '');
        setCategory(offer.category || '');
        setDiscountType(offer.offer_type || 'deal');
        setDiscountValue(offer.discount_percent != null ? String(offer.discount_percent) : '');
        setOriginalPrice(offer.original_price != null ? String(offer.original_price) : '');
        setTermsText(offer.terms || '');
        setStartsAt(toLocalDatetimeValue(offer.starts_at));
        setExpiresAt(toLocalDatetimeValue(offer.expires_at));
        setRedemptionCap(offer.max_redemptions != null ? String(offer.max_redemptions) : '');
        setPerUserLimit('1');
        setRadiusMeters(offer.radius_meters || 500);
        setShowWhenClosed(offer.show_when_closed ?? false);
        setShowCountdown(offer.show_countdown ?? true);
        setCostPrice(offer.cost_price != null ? String(offer.cost_price) : '');
        setSellingPrice(offer.selling_price != null ? String(offer.selling_price) : '');
        setExistingImageUrl(resolveImageUrl(offer.image_url));
        setImagePreview(resolveImageUrl(offer.image_url));
      })
      .catch(() => setFetchError('Could not load offer.'))
      .finally(() => setFetching(false));
  }, [id]);

  function onImageFile(f) { setImageFile(f); setImagePreview(URL.createObjectURL(f)); }

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
      formData.append('description', description);
      formData.append('category', category);
      formData.append('offer_type', discountType);
      if (discountValue) formData.append('discount_percent', discountValue);
      if (originalPrice) formData.append('original_price', originalPrice);
      if (termsText)     formData.append('terms', termsText);
      formData.append('starts_at', new Date(startsAt).toISOString());
      if (expiresAt) formData.append('expires_at', new Date(expiresAt).toISOString());
      if (redemptionCap) formData.append('max_redemptions', redemptionCap);
      formData.append('radius_meters', radiusMeters);
      formData.append('show_when_closed', showWhenClosed);
      formData.append('show_countdown', showCountdown);
      if (costPrice)    formData.append('cost_price', costPrice);
      if (sellingPrice) formData.append('selling_price', sellingPrice);
      if (discountedPrice) formData.append('offer_price', discountedPrice);
      if (imageFile) formData.append('image', imageFile);

      await updateOffer(id, formData);
      toast({ message: 'Offer updated!', type: 'success' });
      navigate('/offers');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update offer.');
    } finally { setLoading(false); }
  }

  if (fetching) return <LoadingBlock label="Loading offer…" />;
  if (fetchError) return <div className="form-error-box" style={{ maxWidth: 480 }}>{fetchError}</div>;

  const previewOffer = {
    title:            title || 'Offer title',
    description:      description || '',
    offer_type:       discountType,
    original_price:   originalPrice || null,
    offer_price:      discountedPrice || null,
    discount_percent: discountType === 'percentage' && discountValue ? discountValue : null,
    icon_color:       '#000000',
    expiresAt,
    category:         category || 'Other',
  };

  return (
    <div className="offer-form-layout">

      <form className="offer-form-col" onSubmit={handleSubmit}>
        <div className="card">
          <div className="card-header"><span className="card-title">Offer details</span></div>
          <div className="card-body">
            {error && <div className="form-error-box">{error}</div>}
            <div className="field">
              <label className="label label-required">Title</label>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div className="field">
              <label className="label">Description</label>
              <textarea className="textarea" value={description} onChange={(e) => setDesc(e.target.value)} rows={3} />
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
            <div className="form-grid">
              {(discountType === 'percentage' || discountType === 'fixed') && (
                <div className="field">
                  <label className="label">{discountType === 'percentage' ? 'Discount %' : 'Amount off (£)'}</label>
                  <input className="input" type="number" min="0" step="0.01" value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)} />
                </div>
              )}
              <div className="field">
                <label className="label">Original price (£)</label>
                <input className="input" type="number" min="0" step="0.01" value={originalPrice}
                  onChange={(e) => setOriginalPrice(e.target.value)} />
                {discountedPrice && <div className="field-hint">Discounted: <strong>£{discountedPrice}</strong></div>}
              </div>
            </div>
            <div className="field">
              <label className="label">Terms & conditions</label>
              <textarea className="textarea" value={termsText} onChange={(e) => setTermsText(e.target.value)} rows={2} />
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
                  onChange={(e) => setExpiresAt(e.target.value)} />
              </div>
            </div>
            <div className="form-grid">
              <div className="field">
                <label className="label">Redemption cap</label>
                <input className="input" type="number" min="1" value={redemptionCap}
                  onChange={(e) => setRedemptionCap(e.target.value)} placeholder="Unlimited" />
              </div>
              <div className="field">
                <label className="label">Per-user limit</label>
                <input className="input" type="number" min="1" value={perUserLimit}
                  onChange={(e) => setPerUserLimit(e.target.value)} />
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--c-border)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: '0.88rem' }}>
                <input type="checkbox" checked={showWhenClosed} onChange={e => setShowWhenClosed(e.target.checked)} />
                <div>
                  <div style={{ fontWeight: 500 }}>Show offer outside opening hours</div>
                  <div className="field-hint" style={{ marginTop: 2 }}>When off, offer is hidden when your business is closed</div>
                </div>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: '0.88rem' }}>
                <input type="checkbox" checked={showCountdown} onChange={e => setShowCountdown(e.target.checked)} />
                <div>
                  <div style={{ fontWeight: 500 }}>Show countdown timer</div>
                  <div className="field-hint" style={{ marginTop: 2 }}>Shows customers how long until the deal expires or you close</div>
                </div>
              </label>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><span className="card-title">Pricing & cost</span></div>
          <div className="card-body">
            <div className="form-grid">
              <div className="field">
                <label className="label">Normal selling price (£)</label>
                <input className="input" type="number" min="0" step="0.01"
                  value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} placeholder="9.99" />
                <div className="field-hint">What you normally charge for this item</div>
              </div>
              <div className="field">
                <label className="label">Your cost price (£)</label>
                <input className="input" type="number" min="0" step="0.01"
                  value={costPrice} onChange={(e) => setCostPrice(e.target.value)} placeholder="3.50" />
                <div className="field-hint">We use this to calculate your profit. It's never shown to customers.</div>
              </div>
            </div>
            {costPrice && discountedPrice && (
              <div style={{ background: 'var(--c-bg-muted)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', padding: '12px 16px', fontSize: '0.85rem', lineHeight: 1.7, marginTop: 4 }}>
                <strong>Profit per redemption:</strong> £{(parseFloat(discountedPrice) - parseFloat(costPrice)).toFixed(2)}
              </div>
            )}
            {!costPrice && !sellingPrice && (
              <div style={{ fontSize: '0.82rem', color: 'var(--c-text-muted)', fontStyle: 'italic', marginTop: 4 }}>
                Add your pricing to unlock profit reports for this offer
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><span className="card-title">Visibility radius</span></div>
          <div className="card-body">
            <RadiusMapPicker radiusMeters={radiusMeters} onChange={setRadiusMeters}
              lat={business?.lat} lng={business?.lng} />
          </div>
        </div>

        <div className="card">
          <div className="card-header"><span className="card-title">Offer image</span></div>
          <div className="card-body">
            <FileDropzone
              label="Drag & drop a new image (or keep existing)"
              hint="1200 × 630 px recommended · PNG, JPG"
              onFile={onImageFile}
              preview={imagePreview}
            />
          </div>
        </div>

        <div className="register-actions" style={{ marginTop: 0 }}>
          <button className="btn btn-secondary" type="button" onClick={() => navigate('/offers')}>Cancel</button>
          <button className="btn btn-primary" type="submit" style={{ flex: 1 }} disabled={loading}>
            {loading ? <Spinner white /> : 'Save changes'}
          </button>
        </div>
      </form>

      <div className="offer-preview-col">
        <div className="offer-preview-sticky">
          <div className="label" style={{ marginBottom: 12, fontWeight: 600 }}>Live preview</div>
          <OfferPreviewCard offer={previewOffer} businessName={business?.name} imagePreview={imagePreview} />
        </div>
      </div>

    </div>
  );
}
