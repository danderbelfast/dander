import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { registerBusiness, verifySetup2FA, resendOtp } from '../api/auth';
import { updateProfile } from '../api/business';
import { useAuth } from '../context/AuthContext';
import { FileDropzone } from '../components/ui/FileDropzone';
import { Spinner } from '../components/ui/Spinner';
import danderLogoBlack from '../assets/Dander_Logo_Black.png';

const CATEGORIES = ['Food & Drink', 'Beauty & Wellness', 'Health & Fitness', 'Entertainment', 'Retail & Shopping', 'Services', 'Experiences & Leisure', 'Other'];
const TOTAL_STEPS = 4;

function StepDot({ n, current }) {
  const done = current > n;
  return <div className={`step-dot${done ? ' done' : current === n ? ' current' : ''}`}>{done ? '✓' : n}</div>;
}

function StepIndicator({ current }) {
  return (
    <div className="step-indicator">
      {[1,2,3,4].map((n, i) => (
        <React.Fragment key={n}>
          <StepDot n={n} current={current} />
          {i < 3 && <div className={`step-line ${current > n ? 'done' : ''}`} />}
        </React.Fragment>
      ))}
    </div>
  );
}

export default function RegisterBusiness() {
  const navigate = useNavigate();
  const { login: authLogin } = useAuth();

  const [step, setStep]     = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');

  // Step 1: owner
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName]   = useState('');
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');

  // Step 2: business
  const [bizName, setBizName]   = useState('');
  const [category, setCategory] = useState('');
  const [address, setAddress]   = useState('');
  const [city, setCity]         = useState('Belfast');
  const [description, setDesc]  = useState('');
  const [bizPhone, setBizPhone] = useState('');
  const [website, setWebsite]   = useState('');

  // Step 3: images
  const [logoFile, setLogoFile]   = useState(null);
  const [coverFile, setCoverFile] = useState(null);
  const [logoPreview, setLogoPreview]   = useState('');
  const [coverPreview, setCoverPreview] = useState('');

  // After API call
  const [userId, setUserId]     = useState(null);
  const [otpCode, setOtpCode]   = useState('');
  const [resent, setResent]     = useState(false);

  function onLogoFile(f)  { setLogoFile(f);  setLogoPreview(URL.createObjectURL(f)); }
  function onCoverFile(f) { setCoverFile(f); setCoverPreview(URL.createObjectURL(f)); }

  // Step 1 → 2
  function nextStep1(e) {
    e.preventDefault(); setError('');
    if (password !== confirm)  { setError('Passwords do not match.'); return; }
    if (password.length < 8)   { setError('Password must be at least 8 characters.'); return; }
    setStep(2);
  }

  // Step 2 → 3
  function nextStep2(e) {
    e.preventDefault(); setError('');
    if (!bizName) { setError('Business name is required.'); return; }
    setStep(3);
  }

  // Step 3 → submit registration → show TOTP QR
  async function submitRegistration(e) {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const data = await registerBusiness(
        { email, password, firstName, lastName },
        { name: bizName, category, address, city, website, phone: bizPhone, description, logoFile, coverFile }
      );
      setUserId(data.userId);
      setStep(4); // show email OTP entry
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed.');
    } finally { setLoading(false); }
  }

  // Verify email OTP → show confirmation
  async function handleVerifyOtp(e) {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      await verifySetup2FA(userId, otpCode);
      setStep(5); // confirmation
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid or expired code. Try again.');
      setOtpCode('');
    } finally { setLoading(false); }
  }

  async function handleResend() {
    setError(''); setResent(false);
    try {
      await resendOtp(userId, 'register');
      setResent(true);
    } catch {
      setError('Could not resend code. Please try again.');
    }
  }

  if (step === 5) {
    return (
      <div className="register-wrap">
        <header className="register-header">
          <div className="register-brand"><img src={danderLogoBlack} alt="Dander" style={{ height: 24, width: 'auto' }} /></div>
        </header>
        <div className="register-body">
          <div className="register-card">
            <div className="confirm-screen">
              <div className="confirm-icon">⏳</div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Application pending approval</h2>
              <p style={{ color: 'var(--c-text-muted)', fontSize: '0.9rem', lineHeight: 1.65, maxWidth: 340 }}>
                Thanks for registering <strong>{bizName}</strong>! Your application has been submitted and
                is awaiting review by our team.
              </p>
              <div style={{ marginTop: 4, padding: '16px 20px', background: 'var(--c-bg-muted)', borderRadius: 'var(--r-md)', maxWidth: 360, lineHeight: 1.7, fontSize: '0.85rem' }}>
                <div style={{ marginBottom: 8, fontWeight: 600 }}>What happens next?</div>
                <div>✅ &nbsp;Our team reviews your application</div>
                <div>✅ &nbsp;You'll receive an email at <strong>{email}</strong> once approved</div>
                <div>✅ &nbsp;Sign in and start adding offers straight away</div>
              </div>
              <button className="btn btn-primary btn-lg" style={{ marginTop: 16 }} onClick={() => navigate('/login')}>
                Go to sign in
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="register-wrap">
      <header className="register-header">
        <div className="register-brand"><span>🔥</span> Dander for Business</div>
        <StepIndicator current={Math.min(step, 4)} />
      </header>

      <div className="register-body">
        <div className="register-card">

          {/* ── Step 1: Owner account ── */}
          {step === 1 && (
            <>
              <div className="register-step-title">Create your owner account</div>
              <div className="register-step-sub">This is the account you'll use to manage your business on Dander.</div>
              <form className="register-form" onSubmit={nextStep1}>
                {error && <div className="form-error-box">{error}</div>}
                <div className="form-grid">
                  <div className="field">
                    <label className="label label-required">First name</label>
                    <input className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Kieran" required />
                  </div>
                  <div className="field">
                    <label className="label label-required">Last name</label>
                    <input className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Kelly" required />
                  </div>
                </div>
                <div className="field">
                  <label className="label label-required">Email address</label>
                  <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@yourbusiness.com" autoComplete="email" required />
                </div>
                <div className="field">
                  <label className="label label-required">Password</label>
                  <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 8 characters" autoComplete="new-password" required />
                </div>
                <div className="field">
                  <label className="label label-required">Confirm password</label>
                  <input className={`input ${confirm && confirm !== password ? 'input-error' : ''}`} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat password" autoComplete="new-password" required />
                </div>
                <div className="register-actions">
                  <button className="btn btn-ghost" type="button" onClick={() => navigate('/login')}>Cancel</button>
                  <button className="btn btn-primary" type="submit" style={{ flex: 1 }}>Continue →</button>
                </div>
              </form>
            </>
          )}

          {/* ── Step 2: Business details ── */}
          {step === 2 && (
            <>
              <div className="register-step-title">Tell us about your business</div>
              <div className="register-step-sub">This information will appear on your public listing in the Dander app.</div>
              <form className="register-form" onSubmit={nextStep2}>
                {error && <div className="form-error-box">{error}</div>}
                <div className="field">
                  <label className="label label-required">Business name</label>
                  <input className="input" value={bizName} onChange={(e) => setBizName(e.target.value)} placeholder="e.g. Kelly's Cellar" required />
                </div>
                <div className="field">
                  <label className="label">Category</label>
                  <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
                    <option value="">Select a category</option>
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
                    <input className="input" type="tel" value={bizPhone} onChange={(e) => setBizPhone(e.target.value)} placeholder="+44 28 9032 4835" />
                  </div>
                </div>
                <div className="field">
                  <label className="label">Website</label>
                  <input className="input" type="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://yourbusiness.com" />
                </div>
                <div className="field">
                  <label className="label">Description</label>
                  <textarea className="textarea" value={description} onChange={(e) => setDesc(e.target.value)} placeholder="Tell customers what makes your business special…" rows={3} />
                </div>
                <div className="register-actions">
                  <button className="btn btn-secondary" type="button" onClick={() => setStep(1)}>← Back</button>
                  <button className="btn btn-primary" type="submit" style={{ flex: 1 }}>Continue →</button>
                </div>
              </form>
            </>
          )}

          {/* ── Step 3: Images ── */}
          {step === 3 && (
            <>
              <div className="register-step-title">Upload your images</div>
              <div className="register-step-sub">These will appear on your Dander listing. You can update them anytime from your profile.</div>
              <div className="register-form">
                <div className="field">
                  <label className="label">Business logo</label>
                  <FileDropzone
                    label="Drag & drop your logo here"
                    hint="Square image recommended · PNG, JPG"
                    onFile={onLogoFile}
                    preview={logoPreview}
                  />
                </div>
                <div className="field">
                  <label className="label">Cover image</label>
                  <FileDropzone
                    label="Drag & drop your cover photo here"
                    hint="1200 × 400 px recommended · PNG, JPG"
                    onFile={onCoverFile}
                    preview={coverPreview}
                  />
                </div>
                <div className="register-actions">
                  <button className="btn btn-secondary" type="button" onClick={() => setStep(2)}>← Back</button>
                  <button className="btn btn-primary" style={{ flex: 1 }} disabled={loading} onClick={submitRegistration}>
                    {loading ? <Spinner white /> : 'Create account →'}
                  </button>
                </div>
                {error && <div className="form-error-box">{error}</div>}
                <p className="field-hint" style={{ textAlign: 'center' }}>
                  Images are optional — you can skip and add them later from your profile.
                </p>
              </div>
            </>
          )}

          {/* ── Step 4: Email OTP verification ── */}
          {step === 4 && (
            <>
              <div className="register-step-title">Check your email</div>
              <div className="register-step-sub">
                We sent a 6-digit verification code to <strong>{email}</strong>. Enter it below to confirm your account.
              </div>

              <form style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 20 }} onSubmit={handleVerifyOtp}>
                {error && <div className="form-error-box">{error}</div>}
                {resent && <div style={{ color: 'var(--c-success)', fontSize: '0.85rem' }}>New code sent!</div>}
                <div className="field">
                  <label className="label">Verification code</label>
                  <input
                    className="input"
                    style={{ fontSize: '1.5rem', letterSpacing: '0.2em', textAlign: 'center', fontFamily: 'monospace' }}
                    type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6}
                    value={otpCode} onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000" autoComplete="one-time-code" autoFocus required
                  />
                </div>
                <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={loading || otpCode.length < 6}>
                  {loading ? <Spinner white /> : 'Verify & complete registration'}
                </button>
                <button type="button" className="btn btn-ghost btn-block" onClick={handleResend}>
                  Resend code
                </button>
              </form>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
