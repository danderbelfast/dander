import React from 'react';

export function UpdateBanner({ onRefresh, onDismiss }) {
  return (
    <div className="update-banner" role="status">
      <span className="update-banner-text">
        Dander has been updated — tap to refresh
      </span>
      <div className="update-banner-actions">
        <button className="update-banner-btn update-banner-btn-refresh" onClick={onRefresh}>
          Refresh
        </button>
        <button className="update-banner-btn update-banner-btn-dismiss" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
