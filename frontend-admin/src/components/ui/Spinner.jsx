import React from 'react';

export function Spinner({ white, lg }) {
  return (
    <span className={`spinner${white ? ' spinner-white' : ''}${lg ? ' spinner-lg' : ''}`} />
  );
}

export function LoadingBlock({ label = 'Loading…' }) {
  return (
    <div className="loading-block">
      <Spinner lg />
      <span>{label}</span>
    </div>
  );
}
