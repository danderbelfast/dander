import React, { useEffect, useState } from 'react';
import {
  getSmartSpecialsSettings, saveSmartSpecialsSettings,
  assessSmartSpecialPhoto, postSmartSpecialOffer,
} from '../api/business';
import { useToast } from '../context/ToastContext';
import { Spinner, LoadingBlock } from '../components/ui/Spinner';
import { FileDropzone } from '../components/ui/FileDropzone';

/* ---------------------------------------------------------------------------
   SmartSpecials.jsx — three-step photo + Claude Vision offer flow.

     Step 1  Choose offer type + value (Discount / Freebie / Urgency)
     Step 2  Take or upload a photo
     Step 3  Review Claude's suggested copy, edit if needed, hit Post.

   Defaults live on the business row (ss_default_*). On first visit, the owner
   is shown a small setup card to set those defaults. Claude only writes copy.
   The owner always approves before anything goes live.
--------------------------------------------------------------------------- */

const OFFER_TYPES = [
  { value: 'discount', title: 'Discount',  hint: '% off or fixed £ off' },
  { value: 'freebie',  title: 'Freebie',   hint: 'e.g. free coffee with any cake' },
  { value: 'urgency',  title: 'Urgency',   hint: 'awareness / call to action — no value' },
];

const DURATIONS = [
  { value: 2,  label: '2h'  },
  { value: 4,  label: '4h'  },
  { value: 8,  label: '8h'  },
  { value: 24, label: '24h' },
  { value: 48, label: '48h' },
];

function formatTime(t) {
  // Accepts 'HH:MM' or 'HH:MM:SS'; renders 'HH:MM'.
  if (!t) return '';
  return String(t).slice(0, 5);
}

function buildOfferValue({ offerType, discountKind, discountPercent, discountFixed, freebieText }) {
  if (offerType === 'discount') {
    if (discountKind === 'percent') {
      const n = parseInt(discountPercent, 10);
      return Number.isFinite(n) && n > 0 ? `${n}%` : '';
    }
    const v = String(discountFixed || '').trim();
    return v ? (v.startsWith('£') ? v : `£${v} off`) : '';
  }
  if (offerType === 'freebie') return (freebieText || '').trim();
  return null;
}

function summariseOffer({ offerType, offerValue }) {
  if (offerType === 'discount') return offerValue || '—';
  if (offerType === 'freebie')  return offerValue || '—';
  return 'Urgency / call to action';
}

export default function SmartSpecials() {
  const { toast } = useToast();

  const [settings, setSettings]   = useState(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [showSetup, setShowSetup] = useState(false);

  const [step, setStep] = useState(1);

  // Step 1 state — initial values fill from settings once loaded.
  const [offerType,        setOfferType]        = useState('discount');
  const [discountKind,     setDiscountKind]     = useState('percent');
  const [discountPercent,  setDiscountPercent]  = useState(15);
  const [discountFixed,    setDiscountFixed]    = useState('');
  const [freebieText,      setFreebieText]      = useState('');

  // Step 2 state.
  const [photoFile,    setPhotoFile]    = useState(null);
  const [photoPreview, setPhotoPreview] = useState('');

  // Step 3 state.
  const [assessing,    setAssessing]    = useState(false);
  const [assessment,   setAssessment]   = useState(null);
  const [title,        setTitle]        = useState('');
  const [description,  setDescription]  = useState('');
  const [origTitle,    setOrigTitle]    = useState('');
  const [origDesc,     setOrigDesc]     = useState('');
  const [duration,     setDuration]     = useState(24);
  const [posting,      setPosting]      = useState(false);

  const [error, setError] = useState('');

  // ── Load settings once on mount ──────────────────────────────────────────
  useEffect(() => {
    getSmartSpecialsSettings()
      .then((d) => {
        const s = d.settings;
        setSettings(s);
        if (!s || !s.ss_setup_complete) setShowSetup(true);
        if (s) {
          setOfferType(s.ss_default_offer_type || 'discount');
          setDiscountPercent(s.ss_default_discount_pct ?? 15);
          setDuration(s.ss_default_duration_hours ?? 24);
        }
      })
      .catch(() => toast({ message: 'Failed to load Smart Specials settings.', type: 'error' }))
      .finally(() => setSettingsLoading(false));
  }, []);

  // ── Setup card handlers ──────────────────────────────────────────────────
  async function saveSetup(data) {
    try {
      const d = await saveSmartSpecialsSettings({ ...data, mark_setup_complete: true });
      setSettings(d.settings);
      setShowSetup(false);
      // Apply the defaults the owner just chose to step 1.
      if (data.ss_default_offer_type)     setOfferType(data.ss_default_offer_type);
      if (data.ss_default_discount_pct)   setDiscountPercent(data.ss_default_discount_pct);
      if (data.ss_default_duration_hours) setDuration(data.ss_default_duration_hours);
      toast({ message: 'Defaults saved. You can change them anytime in Settings.', type: 'success' });
    } catch {
      toast({ message: 'Failed to save defaults.', type: 'error' });
    }
  }

  // ── Step transitions ─────────────────────────────────────────────────────
  function step1Valid() {
    if (offerType === 'discount') {
      if (discountKind === 'percent') {
        const n = parseInt(discountPercent, 10);
        return Number.isFinite(n) && n > 0 && n <= 100;
      }
      return String(discountFixed || '').trim().length > 0;
    }
    if (offerType === 'freebie') return (freebieText || '').trim().length > 0;
    return true; // urgency: no value required
  }

  async function handleAssess() {
    if (!photoFile) return;
    setError('');
    setAssessing(true);
    try {
      const fd = new FormData();
      fd.append('photo', photoFile);
      fd.append('offer_type', offerType);
      const v = buildOfferValue({ offerType, discountKind, discountPercent, discountFixed, freebieText });
      if (v) fd.append('offer_value', v);

      const { assessment } = await assessSmartSpecialPhoto(fd);
      setAssessment(assessment);
      setTitle(assessment.suggested_title || '');
      setDescription(assessment.suggested_description || '');
      setOrigTitle(assessment.suggested_title || '');
      setOrigDesc(assessment.suggested_description || '');
      setStep(3);
      if (!assessment.ai_available) {
        toast({
          message: 'AI is unavailable right now — write your own title and description.',
          type: 'info',
        });
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to analyse the photo.';
      setError(msg);
      toast({ message: msg, type: 'error' });
    } finally {
      setAssessing(false);
    }
  }

  async function handlePost() {
    if (!assessment) return;
    if (!title.trim()) {
      toast({ message: 'Please write a title before posting.', type: 'error' });
      return;
    }
    setPosting(true);
    try {
      const ownerEdited = title !== origTitle || description !== origDesc;
      const offerValue = buildOfferValue({ offerType, discountKind, discountPercent, discountFixed, freebieText });
      await postSmartSpecialOffer({
        assessment_id:  assessment.id,
        title:          title.trim(),
        description:    description.trim(),
        offer_type:     offerType,
        offer_value:    offerValue,
        duration_hours: duration,
        owner_edited:   ownerEdited,
      });
      toast({ message: 'Offer posted — it is now live.', type: 'success' });
      resetToStart();
    } catch (err) {
      toast({ message: err.response?.data?.message || 'Failed to post offer.', type: 'error' });
    } finally {
      setPosting(false);
    }
  }

  function resetToStart() {
    setStep(1);
    setPhotoFile(null);
    setPhotoPreview('');
    setAssessment(null);
    setTitle('');
    setDescription('');
    setOrigTitle('');
    setOrigDesc('');
    setError('');
    // Reset step-1 inputs back to the saved defaults (kept under settings).
    if (settings) {
      setOfferType(settings.ss_default_offer_type || 'discount');
      setDiscountPercent(settings.ss_default_discount_pct ?? 15);
      setDuration(settings.ss_default_duration_hours ?? 24);
    }
    setDiscountKind('percent');
    setDiscountFixed('');
    setFreebieText('');
  }

  // ── Render ───────────────────────────────────────────────────────────────
  if (settingsLoading) return <LoadingBlock label="Loading Smart Specials…" />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 720 }}>
      <header>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>Smart Specials</h2>
        <p style={{ color: 'var(--c-text-muted)', fontSize: '0.88rem', marginTop: 4 }}>
          Take a photo, set the offer, post in seconds. You always approve before it goes live.
        </p>
      </header>

      {showSetup && (
        <SetupCard
          initial={settings}
          onSave={saveSetup}
          onSkip={() => setShowSetup(false)}
        />
      )}

      {!showSetup && (
        <>
          <StepIndicator step={step} />
          {step === 1 && (
            <StepOne
              offerType={offerType} setOfferType={setOfferType}
              discountKind={discountKind} setDiscountKind={setDiscountKind}
              discountPercent={discountPercent} setDiscountPercent={setDiscountPercent}
              discountFixed={discountFixed} setDiscountFixed={setDiscountFixed}
              freebieText={freebieText} setFreebieText={setFreebieText}
              canAdvance={step1Valid()}
              onNext={() => setStep(2)}
            />
          )}
          {step === 2 && (
            <StepTwo
              photoFile={photoFile} photoPreview={photoPreview}
              onFile={(f) => { setPhotoFile(f); setPhotoPreview(URL.createObjectURL(f)); }}
              onBack={() => setStep(1)}
              onAssess={handleAssess}
              assessing={assessing}
              error={error}
            />
          )}
          {step === 3 && assessment && (
            <StepThree
              assessment={assessment}
              title={title} setTitle={setTitle}
              description={description} setDescription={setDescription}
              offerSummary={summariseOffer({
                offerType,
                offerValue: buildOfferValue({ offerType, discountKind, discountPercent, discountFixed, freebieText }),
              })}
              duration={duration} setDuration={setDuration}
              posting={posting}
              onPost={handlePost}
              onReset={resetToStart}
            />
          )}
        </>
      )}
    </div>
  );
}

// ── Setup card ─────────────────────────────────────────────────────────────
function SetupCard({ initial, onSave, onSkip }) {
  const [offerType, setOfferType] = useState(initial?.ss_default_offer_type ?? 'discount');
  const [pct,       setPct]       = useState(initial?.ss_default_discount_pct ?? 15);
  const [dur,       setDur]       = useState(initial?.ss_default_duration_hours ?? 24);
  const [start,     setStart]     = useState(formatTime(initial?.ss_active_hours_start) || '08:00');
  const [end,       setEnd]       = useState(formatTime(initial?.ss_active_hours_end)   || '20:00');
  const [saving,    setSaving]    = useState(false);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        ss_default_offer_type:     offerType,
        ss_default_discount_pct:   parseInt(pct, 10),
        ss_default_duration_hours: parseInt(dur, 10),
        ss_active_hours_start:     start,
        ss_active_hours_end:       end,
      });
    } finally { setSaving(false); }
  }

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Set your Smart Specials defaults</span>
      </div>
      <div className="card-body">
        <p style={{ fontSize: '0.88rem', color: 'var(--c-text-muted)', marginTop: 0 }}>
          Saves time every day. You can change these in Settings whenever you want.
        </p>
        <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="field">
            <label className="label">Default offer type</label>
            <select className="input" value={offerType} onChange={(e) => setOfferType(e.target.value)}>
              {OFFER_TYPES.map(t => <option key={t.value} value={t.value}>{t.title}</option>)}
            </select>
          </div>
          <div className="form-grid">
            <div className="field">
              <label className="label">Default discount %</label>
              <input className="input" type="number" min="1" max="100"
                value={pct} onChange={(e) => setPct(e.target.value)} />
            </div>
            <div className="field">
              <label className="label">Default duration (hours)</label>
              <input className="input" type="number" min="1" max="168"
                value={dur} onChange={(e) => setDur(e.target.value)} />
            </div>
          </div>
          <div className="form-grid">
            <div className="field">
              <label className="label">Active hours from</label>
              <input className="input" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="field">
              <label className="label">Active hours to</label>
              <input className="input" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn btn-secondary" onClick={onSkip}>Skip for now</button>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={saving}>
              {saving ? <Spinner white /> : 'Save defaults'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Step indicator ─────────────────────────────────────────────────────────
function StepIndicator({ step }) {
  const labels = ['Offer type', 'Photo', 'Review'];
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {labels.map((l, i) => {
        const n = i + 1;
        const active = n === step;
        const done = n < step;
        return (
          <div key={l} style={{
            flex: 1, padding: '8px 12px', borderRadius: 'var(--r-md)',
            background: active ? 'var(--c-primary)' : done ? 'var(--c-bg-muted)' : 'transparent',
            color: active ? '#fff' : done ? 'var(--c-text)' : 'var(--c-text-muted)',
            border: active ? 'none' : '1px solid var(--c-border)',
            fontSize: '0.82rem', fontWeight: 600, textAlign: 'center',
          }}>
            {n}. {l}
          </div>
        );
      })}
    </div>
  );
}

// ── Step 1: choose offer type ──────────────────────────────────────────────
function StepOne({
  offerType, setOfferType, discountKind, setDiscountKind,
  discountPercent, setDiscountPercent, discountFixed, setDiscountFixed,
  freebieText, setFreebieText, canAdvance, onNext,
}) {
  return (
    <div className="card">
      <div className="card-header"><span className="card-title">What kind of offer?</span></div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {OFFER_TYPES.map(t => (
            <button key={t.value} type="button"
              onClick={() => setOfferType(t.value)}
              style={{
                padding: '12px', borderRadius: 'var(--r-md)', cursor: 'pointer',
                background: offerType === t.value ? 'var(--c-primary)' : 'var(--c-bg)',
                color:      offerType === t.value ? '#fff' : 'var(--c-text)',
                border:     offerType === t.value ? 'none' : '1px solid var(--c-border)',
                textAlign: 'left',
              }}>
              <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>{t.title}</div>
              <div style={{ fontSize: '0.74rem', opacity: 0.85, marginTop: 4 }}>{t.hint}</div>
            </button>
          ))}
        </div>

        {offerType === 'discount' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 16, fontSize: '0.88rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="radio" checked={discountKind === 'percent'} onChange={() => setDiscountKind('percent')} />
                % off
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="radio" checked={discountKind === 'fixed'} onChange={() => setDiscountKind('fixed')} />
                £ off
              </label>
            </div>
            {discountKind === 'percent' ? (
              <div className="field">
                <label className="label">Percentage</label>
                <input className="input" type="number" min="1" max="100"
                  value={discountPercent}
                  onChange={(e) => setDiscountPercent(e.target.value)} />
              </div>
            ) : (
              <div className="field">
                <label className="label">Amount off (£)</label>
                <input className="input" type="text"
                  placeholder="e.g. 5"
                  value={discountFixed}
                  onChange={(e) => setDiscountFixed(e.target.value)} />
              </div>
            )}
          </div>
        )}

        {offerType === 'freebie' && (
          <div className="field">
            <label className="label">What's the freebie?</label>
            <input className="input" type="text"
              placeholder="e.g. free coffee with any cake"
              value={freebieText}
              onChange={(e) => setFreebieText(e.target.value)} />
          </div>
        )}

        {offerType === 'urgency' && (
          <div style={{
            background: 'var(--c-bg-muted)', padding: '12px 14px', borderRadius: 'var(--r-md)',
            fontSize: '0.84rem', color: 'var(--c-text-muted)',
          }}>
            We'll write a compelling call to action from your photo.
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
          <button className="btn btn-primary" onClick={onNext} disabled={!canAdvance}>
            Next — add photo
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Step 2: photo ──────────────────────────────────────────────────────────
function StepTwo({ photoFile, photoPreview, onFile, onBack, onAssess, assessing, error }) {
  return (
    <div className="card">
      <div className="card-header"><span className="card-title">Show us what you're promoting</span></div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <FileDropzone
          label="Take a photo or upload"
          hint="JPEG or PNG · max 5 MB"
          onFile={onFile}
          preview={photoPreview}
        />
        {error && <div className="form-error-box">{error}</div>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
          <button className="btn btn-secondary" onClick={onBack} disabled={assessing}>Back</button>
          <button className="btn btn-primary" onClick={onAssess} disabled={!photoFile || assessing}>
            {assessing ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Spinner white /> Crafting your offer…
              </span>
            ) : 'Generate copy'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Step 3: review + post ──────────────────────────────────────────────────
function StepThree({
  assessment, title, setTitle, description, setDescription,
  offerSummary, duration, setDuration,
  posting, onPost, onReset,
}) {
  return (
    <div className="card">
      <div className="card-header"><span className="card-title">Review and post</span></div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          {assessment.photo_url && (
            <img src={assessment.photo_url} alt=""
              style={{
                width: 110, height: 110, borderRadius: 'var(--r-md)',
                objectFit: 'cover', flexShrink: 0, border: '1px solid var(--c-border)',
              }} />
          )}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.74rem', color: 'var(--c-text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
              Offer
            </div>
            <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{offerSummary}</div>
            {assessment.photo_summary && (
              <div style={{ fontSize: '0.78rem', color: 'var(--c-text-muted)', marginTop: 8, lineHeight: 1.5 }}>
                <em>Claude saw:</em> {assessment.photo_summary}
              </div>
            )}
          </div>
        </div>

        <div className="field">
          <label className="label label-required">Title</label>
          <input className="input" value={title} maxLength={80}
            onChange={(e) => setTitle(e.target.value)} />
        </div>

        <div className="field">
          <label className="label">Description</label>
          <textarea className="textarea" rows={3} value={description} maxLength={400}
            onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div className="field">
          <label className="label">Live for</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {DURATIONS.map(d => (
              <button key={d.value} type="button"
                onClick={() => setDuration(d.value)}
                className={`btn btn-sm ${duration === d.value ? 'btn-primary' : 'btn-secondary'}`}>
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
          <button className="btn btn-secondary" onClick={onReset} disabled={posting}>Start over</button>
          <button className="btn btn-primary" onClick={onPost} disabled={posting || !title.trim()}>
            {posting ? <Spinner white /> : 'Post offer'}
          </button>
        </div>
      </div>
    </div>
  );
}
