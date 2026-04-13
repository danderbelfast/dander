import React from 'react';
import danderLogo from '../../assets/dander-app-logo.png';

export function InstallBanner({ isIos, onInstall, onDismiss }) {
  return (
    <div className="install-banner">
      <img src={danderLogo} alt="" className="install-banner-logo" />
      <div className="install-banner-text">
        <div className="install-banner-title">
          {isIos ? 'Install Dander for the best experience' : 'Add Dander to your home screen'}
        </div>
        <div className="install-banner-sub">
          {isIos
            ? 'Tap the share button below then "Add to Home Screen"'
            : 'Get deal alerts even when you\'re not browsing'}
        </div>
      </div>
      {isIos ? (
        <div className="install-banner-ios-arrow">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 5v14M5 12l7 7 7-7"/>
          </svg>
        </div>
      ) : (
        <button className="install-banner-btn" onClick={onInstall}>
          Install
        </button>
      )}
      <button className="install-banner-close" onClick={onDismiss} aria-label="Dismiss">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  );
}
