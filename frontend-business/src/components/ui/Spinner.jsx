import React from 'react';

export function Spinner({ size = 'md', white = false }) {
  return <div className={`spinner${size === 'lg' ? ' spinner-lg' : ''}${white ? ' spinner-white' : ''}`} />;
}

export function LoadingBlock({ label = 'Loading…' }) {
  return (
    <div className="loading-block">
      <Spinner size="lg" />
      <span>{label}</span>
    </div>
  );
}
