import React from 'react';

export function StarDisplay({ rating, count, visible, size = 14 }) {
  if (!visible || rating == null) return null;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{ color: '#F59E0B', fontSize: size, lineHeight: 1 }}>
        {'★'.repeat(Math.round(rating))}{'☆'.repeat(5 - Math.round(rating))}
      </span>
      <span style={{ fontSize: size * 0.75, color: 'var(--c-text-muted)', fontWeight: 500 }}>
        {rating} ({count})
      </span>
    </span>
  );
}

export function NewBadge() {
  return (
    <span style={{
      fontSize: '0.68rem', fontWeight: 600, color: 'var(--c-primary)',
      background: 'var(--c-primary-light, rgba(232,93,38,0.1))',
      padding: '1px 6px', borderRadius: 'var(--r-full)',
    }}>
      NEW
    </span>
  );
}

export function StarInput({ value, onChange, size = 32 }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" onClick={() => onChange(n)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 2,
            fontSize: size, color: n <= value ? '#F59E0B' : '#D1D5DB',
            transition: 'transform 0.1s',
            transform: n <= value ? 'scale(1.1)' : 'scale(1)',
          }}>
          ★
        </button>
      ))}
    </div>
  );
}
