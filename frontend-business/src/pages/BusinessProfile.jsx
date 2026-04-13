import React, { useState, useEffect } from 'react';
import { getProfile, updateProfile, getStaff, addStaff, removeStaff, getBusinessHours, saveBusinessHours as saveHoursApi, addSpecialHours as addSpecialApi, deleteSpecialHours as deleteSpecialApi } from '../api/business';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { FileDropzone } from '../components/ui/FileDropzone';
import { resolveImageUrl } from '../utils/imageUrl';
import { Spinner } from '../components/ui/Spinner';
import { LoadingBlock } from '../components/ui/Spinner';
import { LocationPicker } from '../components/ui/LocationPicker';

const CATEGORIES = ['Food & Drink', 'Beauty & Wellness', 'Health & Fitness', 'Entertainment', 'Retail & Shopping', 'Services', 'Experiences & Leisure', 'Other'];

export default function BusinessProfile() {
  const { business, setBusiness } = useAuth();
  const { toast } = useToast();

  const [fetching, setFetching] = useState(true);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  // Fields
  const [name, setName]               = useState('');
  const [category, setCategory]       = useState('');
  const [address, setAddress]         = useState('');
  const [city, setCity]               = useState('');
  const [phone, setPhone]             = useState('');
  const [website, setWebsite]         = useState('');
  const [description, setDesc]        = useState('');

  // Location
  const [lat, setLat] = useState(null);
  const [lng, setLng] = useState(null);

  // Images
  const [logoFile, setLogoFile]       = useState(null);
  const [coverFile, setCoverFile]     = useState(null);
  const [logoPreview, setLogoPreview] = useState('');
  const [coverPreview, setCoverPreview] = useState('');

  // Staff management
  const [staffList, setStaffList]         = useState([]);
  const [staffName, setStaffName]         = useState('');
  const [staffEmail, setStaffEmail]       = useState('');
  const [staffPin, setStaffPin]           = useState('');
  const [staffLoading, setStaffLoading]   = useState(false);
  const [staffError, setStaffError]       = useState('');

  // Opening hours
  const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const defaultHours = DAYS.map((_, i) => ({ day_of_week: i, opens_at: '09:00', closes_at: '17:00', is_closed: i === 0 }));
  const [hours, setHours]               = useState(defaultHours);
  const [specialList, setSpecialList]   = useState([]);
  const [hoursStatus, setHoursStatus]   = useState(null);
  const [hoursSaving, setHoursSaving]   = useState(false);
  const [specialDate, setSpecialDate]   = useState('');
  const [specialLabel, setSpecialLabel] = useState('');
  const [specialClosed, setSpecialClosed] = useState(true);
  const [specialOpens, setSpecialOpens] = useState('09:00');
  const [specialCloses, setSpecialCloses] = useState('17:00');

  useEffect(() => {
    Promise.all([getProfile(), getStaff(), getBusinessHours()])
      .then(([{ business: biz }, { staff }, hoursData]) => {
        // Hours
        if (hoursData.hours && hoursData.hours.length > 0) {
          setHours(DAYS.map((_, i) => {
            const saved = hoursData.hours.find(h => h.day_of_week === i);
            return saved || { day_of_week: i, opens_at: '09:00', closes_at: '17:00', is_closed: false };
          }));
        }
        setSpecialList(hoursData.special || []);
        setHoursStatus(hoursData.status || null);
        setName(biz.name || '');
        setCategory(biz.category || '');
        setAddress(biz.address || '');
        setCity(biz.city || '');
        setPhone(biz.phone || '');
        setWebsite(biz.website || '');
        setDesc(biz.description || '');
        setLogoPreview(resolveImageUrl(biz.logo_url));
        setCoverPreview(resolveImageUrl(biz.cover_image_url));
        if (biz.lat) setLat(parseFloat(biz.lat));
        if (biz.lng) setLng(parseFloat(biz.lng));
        setStaffList(staff || []);
      })
      .catch(() => setError('Failed to load profile.'))
      .finally(() => setFetching(false));
  }, []);

  function onLogoFile(f)  { setLogoFile(f);  setLogoPreview(URL.createObjectURL(f)); }
  function onCoverFile(f) { setCoverFile(f); setCoverPreview(URL.createObjectURL(f)); }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const formData = new FormData();
      formData.append('name', name);
      formData.append('category', category);
      formData.append('address', address);
      formData.append('city', city);
      formData.append('phone', phone);
      formData.append('website', website);
      formData.append('description', description);
      if (lat != null) formData.append('lat', lat);
      if (lng != null) formData.append('lng', lng);
      if (logoFile)  formData.append('logo', logoFile);
      if (coverFile) formData.append('cover', coverFile);

      const { business: updated } = await updateProfile(formData);
      setBusiness(updated);
      toast({ message: 'Profile updated!', type: 'success' });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save changes.');
    } finally { setLoading(false); }
  }

  async function handleAddStaff(e) {
    e.preventDefault();
    setStaffError(''); setStaffLoading(true);
    try {
      const { staff } = await addStaff({ name: staffName, email: staffEmail, pin: staffPin });
      setStaffList((prev) => {
        const idx = prev.findIndex((s) => s.id === staff.id);
        return idx >= 0 ? prev.map((s) => s.id === staff.id ? staff : s) : [...prev, staff];
      });
      setStaffName(''); setStaffEmail(''); setStaffPin('');
      toast({ message: `${staff.name} added.`, type: 'success' });
    } catch (err) {
      setStaffError(err.response?.data?.message || 'Failed to add staff member.');
    } finally { setStaffLoading(false); }
  }

  async function handleRemoveStaff(id, name) {
    if (!window.confirm(`Remove ${name}?`)) return;
    try {
      await removeStaff(id);
      setStaffList((prev) => prev.filter((s) => s.id !== id));
      toast({ message: `${name} removed.`, type: 'success' });
    } catch {
      toast({ message: 'Failed to remove staff member.', type: 'error' });
    }
  }

  function updateHour(dayIdx, field, val) {
    setHours(prev => prev.map(h => h.day_of_week === dayIdx ? { ...h, [field]: val } : h));
  }

  function copyMonToWeekdays() {
    const mon = hours.find(h => h.day_of_week === 1);
    if (!mon) return;
    setHours(prev => prev.map(h => (h.day_of_week >= 1 && h.day_of_week <= 5) ? { ...h, opens_at: mon.opens_at, closes_at: mon.closes_at, is_closed: mon.is_closed } : h));
  }

  function copyToWeekend() {
    const mon = hours.find(h => h.day_of_week === 1);
    if (!mon) return;
    setHours(prev => prev.map(h => (h.day_of_week === 0 || h.day_of_week === 6) ? { ...h, opens_at: mon.opens_at, closes_at: mon.closes_at, is_closed: mon.is_closed } : h));
  }

  async function handleSaveHours() {
    setHoursSaving(true);
    try {
      await saveHoursApi(hours);
      const updated = await getBusinessHours();
      setHoursStatus(updated.status || null);
      toast({ type: 'success', title: 'Opening hours saved' });
    } catch {
      toast({ type: 'error', title: 'Failed to save hours' });
    } finally { setHoursSaving(false); }
  }

  async function handleAddSpecial(e) {
    e.preventDefault();
    try {
      const result = await addSpecialApi({
        date: specialDate,
        is_closed: specialClosed,
        opens_at: specialClosed ? null : specialOpens,
        closes_at: specialClosed ? null : specialCloses,
        label: specialLabel,
      });
      setSpecialList(prev => [...prev, result.special]);
      setSpecialDate(''); setSpecialLabel('');
      toast({ type: 'success', title: 'Special date added' });
    } catch {
      toast({ type: 'error', title: 'Failed to add special date' });
    }
  }

  async function handleDeleteSpecial(id) {
    try {
      await deleteSpecialApi(id);
      setSpecialList(prev => prev.filter(s => s.id !== id));
    } catch { toast({ type: 'error', title: 'Failed to delete' }); }
  }

  if (fetching) return <LoadingBlock label="Loading profile…" />;

  return (
    <div style={{ maxWidth: 760 }}>

      {/* Cover & logo preview */}
      <div style={{ marginBottom: 28, borderRadius: 'var(--r-lg)', overflow: 'hidden', border: '1px solid var(--c-border)' }}>
        {coverPreview ? (
          <img src={coverPreview} alt="Cover" style={{ width: '100%', height: 180, objectFit: 'cover', display: 'block' }} />
        ) : (
          <div style={{ width: '100%', height: 180, background: 'var(--c-bg-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--c-text-muted)', fontSize: '0.85rem' }}>
            No cover image
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px', background: '#fff' }}>
          {logoPreview ? (
            <img src={logoPreview} alt="Logo" style={{ width: 56, height: 56, borderRadius: 10, objectFit: 'cover', border: '1px solid var(--c-border)' }} />
          ) : (
            <div style={{ width: 56, height: 56, borderRadius: 10, background: 'var(--c-bg-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' }}>
              🏪
            </div>
          )}
          <div>
            <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--c-heading)' }}>{name || 'Your business'}</div>
            {category && <div style={{ fontSize: '0.82rem', color: 'var(--c-text-muted)' }}>{category}</div>}
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {error && <div className="form-error-box">{error}</div>}

        {/* Basic info */}
        <div className="card">
          <div className="card-header"><span className="card-title">Business information</span></div>
          <div className="card-body">
            <div className="field">
              <label className="label label-required">Business name</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="field">
              <label className="label">Category</label>
              <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">Select…</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="label">Address</label>
              <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="30 Bank St" />
            </div>
            <div className="form-grid">
              <div className="field">
                <label className="label">City</label>
                <input className="input" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Belfast" />
              </div>
              <div className="field">
                <label className="label">Phone</label>
                <input className="input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+44 28 9032 4835" />
              </div>
            </div>
            <div className="field">
              <label className="label">Website</label>
              <input className="input" type="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://yourbusiness.com" />
            </div>
            <div className="field">
              <label className="label">Description</label>
              <textarea className="textarea" value={description} onChange={(e) => setDesc(e.target.value)}
                placeholder="Tell customers what makes your business special…" rows={4} />
            </div>
          </div>
        </div>

        {/* Location */}
        <div className="card">
          <div className="card-header"><span className="card-title">Business location</span></div>
          <div className="card-body">
            <p style={{ fontSize: '0.82rem', color: 'var(--c-text-muted)', marginBottom: 12, lineHeight: 1.6 }}>
              Search for your address (include postcode for accuracy), then drag the pin to your exact front door.
              This is used to show your offers to nearby customers.
            </p>
            <LocationPicker
              lat={lat}
              lng={lng}
              onChange={(newLat, newLng) => { setLat(newLat); setLng(newLng); }}
            />
          </div>
        </div>

        {/* Images */}
        <div className="card">
          <div className="card-header"><span className="card-title">Images</span></div>
          <div className="card-body">
            <div className="field">
              <label className="label">Business logo</label>
              <FileDropzone
                label="Drag & drop your logo"
                hint="Square image recommended · PNG, JPG"
                onFile={onLogoFile}
                preview={logoPreview}
              />
            </div>
            <div className="field" style={{ marginTop: 16 }}>
              <label className="label">Cover image</label>
              <FileDropzone
                label="Drag & drop your cover photo"
                hint="1200 × 400 px recommended · PNG, JPG"
                onFile={onCoverFile}
                preview={coverPreview}
              />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" type="submit" style={{ minWidth: 160 }} disabled={loading}>
            {loading ? <Spinner white /> : 'Save changes'}
          </button>
        </div>
      </form>

      {/* Staff & PINs */}
      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-header"><span className="card-title">Staff & PINs</span></div>
        <div className="card-body">
          <p style={{ fontSize: '0.82rem', color: 'var(--c-text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
            Staff PINs are used to verify coupon redemptions. Add yourself or your team members here.
          </p>

          {staffList.filter((s) => s.is_active).length > 0 && (
            <div style={{ marginBottom: 20 }}>
              {staffList.filter((s) => s.is_active).map((s) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--c-border)' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{s.name}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--c-text-muted)' }}>{s.email}</div>
                  </div>
                  <button className="btn btn-ghost" style={{ fontSize: '0.78rem', color: 'var(--c-danger, #dc2626)' }}
                    onClick={() => handleRemoveStaff(s.id, s.name)}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleAddStaff} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {staffError && <div className="form-error-box">{staffError}</div>}
            <div className="form-grid">
              <div className="field">
                <label className="label label-required">Name</label>
                <input className="input" value={staffName} onChange={(e) => setStaffName(e.target.value)} placeholder="e.g. John" required />
              </div>
              <div className="field">
                <label className="label label-required">Email</label>
                <input className="input" type="email" value={staffEmail} onChange={(e) => setStaffEmail(e.target.value)} placeholder="john@yourbusiness.com" required />
              </div>
            </div>
            <div className="field" style={{ maxWidth: 200 }}>
              <label className="label label-required">PIN (4–12 digits)</label>
              <input className="input" type="password" inputMode="numeric" value={staffPin}
                onChange={(e) => setStaffPin(e.target.value.replace(/\D/g, ''))}
                placeholder="••••" minLength={4} maxLength={12} required />
              <div className="field-hint">Used to verify coupon redemptions at the till.</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" type="submit" disabled={staffLoading} style={{ minWidth: 140 }}>
                {staffLoading ? <Spinner white /> : 'Add staff member'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Opening Hours */}
      <div className="card">
        <div className="card-header"><span className="card-title">Opening hours</span></div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Status preview */}
          {hoursStatus && (
            <div style={{ padding: '10px 14px', background: hoursStatus.isOpen ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)', borderRadius: 'var(--r-md)', fontSize: '0.85rem' }}>
              Your business currently shows as: <strong style={{ color: hoursStatus.isOpen ? '#16a34a' : '#dc2626' }}>{hoursStatus.isOpen ? 'OPEN' : 'CLOSED'}</strong>
              {!hoursStatus.isOpen && hoursStatus.nextOpenTime && <span style={{ color: 'var(--c-text-muted)' }}> — opens {hoursStatus.nextOpenTime}</span>}
            </div>
          )}

          {/* 7-day grid */}
          {[1,2,3,4,5,6,0].map(dayIdx => {
            const h = hours.find(r => r.day_of_week === dayIdx) || { day_of_week: dayIdx, opens_at: '09:00', closes_at: '17:00', is_closed: false };
            return (
              <div key={dayIdx} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ width: 90, fontWeight: 500, fontSize: '0.88rem', flexShrink: 0 }}>{DAYS[dayIdx]}</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', cursor: 'pointer', flexShrink: 0 }}>
                  <input type="checkbox" checked={h.is_closed} onChange={e => updateHour(dayIdx, 'is_closed', e.target.checked)} /> Closed
                </label>
                {!h.is_closed && (
                  <>
                    <input type="time" className="input" style={{ width: 120, padding: '6px 8px', fontSize: '0.82rem' }}
                      value={h.opens_at || '09:00'} onChange={e => updateHour(dayIdx, 'opens_at', e.target.value)} />
                    <span style={{ fontSize: '0.82rem', color: 'var(--c-text-muted)' }}>to</span>
                    <input type="time" className="input" style={{ width: 120, padding: '6px 8px', fontSize: '0.82rem' }}
                      value={h.closes_at || '17:00'} onChange={e => updateHour(dayIdx, 'closes_at', e.target.value)} />
                  </>
                )}
              </div>
            );
          })}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={copyMonToWeekdays}>Copy Monday to all weekdays</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={copyToWeekend}>Copy to weekend</button>
          </div>

          {/* Special hours */}
          <div style={{ borderTop: '1px solid var(--c-border)', paddingTop: 14 }}>
            <div style={{ fontWeight: 600, fontSize: '0.88rem', marginBottom: 10 }}>Special hours</div>
            {specialList.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                {specialList.map(s => (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.82rem', padding: '6px 10px', background: 'var(--c-bg-muted)', borderRadius: 'var(--r-sm)' }}>
                    <span style={{ fontWeight: 500 }}>{s.date}</span>
                    {s.label && <span style={{ color: 'var(--c-text-muted)' }}>({s.label})</span>}
                    <span>{s.is_closed ? 'Closed' : `${s.opens_at} – ${s.closes_at}`}</span>
                    <button className="btn btn-ghost" style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--c-danger, #dc2626)', padding: '2px 8px' }}
                      onClick={() => handleDeleteSpecial(s.id)}>Remove</button>
                  </div>
                ))}
              </div>
            )}
            <form onSubmit={handleAddSpecial} style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
              <div className="field" style={{ margin: 0 }}>
                <label className="label" style={{ fontSize: '0.75rem' }}>Date</label>
                <input type="date" className="input" style={{ padding: '6px 8px', fontSize: '0.82rem' }}
                  value={specialDate} onChange={e => setSpecialDate(e.target.value)} required />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label className="label" style={{ fontSize: '0.75rem' }}>Label</label>
                <input className="input" style={{ padding: '6px 8px', fontSize: '0.82rem', width: 140 }}
                  value={specialLabel} onChange={e => setSpecialLabel(e.target.value)} placeholder="Bank Holiday" />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', cursor: 'pointer', paddingBottom: 4 }}>
                <input type="checkbox" checked={specialClosed} onChange={e => setSpecialClosed(e.target.checked)} /> Closed
              </label>
              {!specialClosed && (
                <>
                  <input type="time" className="input" style={{ width: 110, padding: '6px 8px', fontSize: '0.82rem' }}
                    value={specialOpens} onChange={e => setSpecialOpens(e.target.value)} />
                  <input type="time" className="input" style={{ width: 110, padding: '6px 8px', fontSize: '0.82rem' }}
                    value={specialCloses} onChange={e => setSpecialCloses(e.target.value)} />
                </>
              )}
              <button className="btn btn-secondary btn-sm" type="submit" disabled={!specialDate}>Add</button>
            </form>
          </div>

          <button className="btn btn-primary" onClick={handleSaveHours} disabled={hoursSaving} style={{ alignSelf: 'flex-start' }}>
            {hoursSaving ? <Spinner white /> : 'Save opening hours'}
          </button>
        </div>
      </div>
    </div>
  );
}
