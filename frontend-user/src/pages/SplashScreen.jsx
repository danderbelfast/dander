import React from 'react';
import { useNavigate } from 'react-router-dom';
import danderLogo   from '../assets/Dander_Logo_White.png';
import customerImg  from '../assets/Dander_customer.webp';
import vendorImg    from '../assets/Dander_vendor.webp';

export default function SplashScreen() {
  const navigate = useNavigate();

  return (
    <div className="sp-root">

      {/* ── Panel 1: Shoppers ── */}
      <div className="sp-half sp-half-user" onClick={() => navigate('/for-users')}>
        <img className="sp-bg" src={customerImg} alt="" />
        <div className="sp-overlay-dark" />
        <div className="sp-overlay-vignette" />
        <img className="sp-logo-img sp-logo-left" src={danderLogo} alt="Dander" />
        <div className="sp-text sp-text-left">
          <div className="sp-label"><span className="sp-label-pill">For Shoppers</span></div>
          <div className="sp-headline">Deals right<br />where you are.</div>
          <div className="sp-sub">Belfast's best offers the moment you walk past.</div>
          <button className="sp-cta" onClick={(e) => { e.stopPropagation(); navigate('/for-users'); }}>Find deals near me</button>
        </div>
      </div>

      {/* ── "or" pill ── */}
      <div className="sp-divider">or</div>

      {/* ── Panel 2: Businesses ── */}
      <div className="sp-half sp-half-business" onClick={() => navigate('/for-business')}>
        <img className="sp-bg" src={vendorImg} alt="" />
        <div className="sp-overlay-dark" />
        <div className="sp-overlay-vignette" />
        <div className="sp-text sp-text-left sp-text-business">
          <div className="sp-label"><span className="sp-label-pill">For Businesses</span></div>
          <div className="sp-headline">Grow your<br />foot traffic.</div>
          <div className="sp-sub">They're already walking past. Give them a reason to stop.</div>
          <button className="sp-cta" onClick={(e) => { e.stopPropagation(); navigate('/for-business'); }}>List my business free</button>
        </div>
      </div>

    </div>
  );
}
