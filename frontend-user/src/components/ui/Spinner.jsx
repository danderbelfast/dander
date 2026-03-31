import React from 'react';

export function Spinner({ size = 'md', label = 'Loading…' }) {
  return <div className={`spinner spinner-${size}`} role="status" aria-label={label} />;
}

export function LoadingCenter({ label = 'Loading…' }) {
  return (
    <div className="loading-center">
      <Spinner size="lg" />
      <span>{label}</span>
    </div>
  );
}
