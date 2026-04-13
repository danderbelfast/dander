import React, { useState } from 'react';

function today() { return new Date().toISOString().slice(0, 10); }
function startOfWeek() {
  const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1);
  return d.toISOString().slice(0, 10);
}
function startOfMonth() { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); }
function startOfYear()  { return `${new Date().getFullYear()}-01-01`; }

const PRESETS = [
  { label: 'Today',      from: today,        to: today },
  { label: 'This week',  from: startOfWeek,  to: today },
  { label: 'This month', from: startOfMonth, to: today },
  { label: 'This year',  from: startOfYear,  to: today },
];

export function DateRangePicker({ from, to, onChange }) {
  const [custom, setCustom] = useState(false);
  const activePreset = PRESETS.findIndex(p => p.from() === from && p.to() === to);

  function selectPreset(p) {
    setCustom(false);
    onChange(p.from(), p.to());
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      {PRESETS.map((p, i) => (
        <button
          key={p.label}
          type="button"
          className={`btn btn-sm ${!custom && activePreset === i ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => selectPreset(p)}
        >
          {p.label}
        </button>
      ))}
      <button
        type="button"
        className={`btn btn-sm ${custom ? 'btn-primary' : 'btn-secondary'}`}
        onClick={() => setCustom(true)}
      >
        Custom
      </button>
      {custom && (
        <>
          <input type="date" className="input" style={{ width: 150, padding: '6px 10px', fontSize: '0.82rem' }}
            value={from} onChange={(e) => onChange(e.target.value, to)} />
          <span style={{ color: 'var(--c-text-muted)', fontSize: '0.82rem' }}>to</span>
          <input type="date" className="input" style={{ width: 150, padding: '6px 10px', fontSize: '0.82rem' }}
            value={to} onChange={(e) => onChange(from, e.target.value)} />
        </>
      )}
    </div>
  );
}
