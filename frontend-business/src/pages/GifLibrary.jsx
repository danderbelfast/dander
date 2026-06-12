import React, { useEffect, useState } from 'react';
import { getLoyaltyGifs, addLoyaltyGif, deleteLoyaltyGif, searchGiphy } from '../api/business';
import { useToast } from '../context/ToastContext';
import { Spinner } from '../components/ui/Spinner';

const TRIGGERS = [
  { key: 'regular',                label: 'Regular' },
  { key: 'first_visit',            label: 'First Visit' },
  { key: 'milestone_10',           label: 'Milestone 10' },
  { key: 'milestone_50',           label: 'Milestone 50' },
  { key: 'milestone_100',          label: 'Milestone 100' },
  { key: 'long_absence',           label: 'Long Absence' },
  { key: 'birthday',               label: 'Birthday' },
  { key: 'already_visited_today',  label: 'Already Visited' },
  { key: 'stranger',               label: 'Stranger' },
];

export default function GifLibrary() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState(TRIGGERS[0].key);
  const [byTrigger, setByTrigger] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    refresh();
  }, []);

  function refresh() {
    setLoading(true);
    getLoyaltyGifs()
      .then((d) => setByTrigger(d.gifs || {}))
      .catch(() => toast({ message: 'Failed to load GIFs.', type: 'error' }))
      .finally(() => setLoading(false));
  }

  async function remove(gif) {
    if (!window.confirm('Remove this GIF from your library?')) return;
    try {
      await deleteLoyaltyGif(gif.id);
      refresh();
    } catch (err) {
      toast({ message: err.response?.data?.message || 'Failed to remove.', type: 'error' });
    }
  }

  async function addPick(gif) {
    try {
      await addLoyaltyGif({ gif_id: gif.id, gif_url: gif.gif_url, trigger_type: activeTab });
      toast({ message: 'GIF added.', type: 'success' });
      setSearchOpen(false);
      refresh();
    } catch (err) {
      toast({ message: err.response?.data?.message || 'Failed to add.', type: 'error' });
    }
  }

  const current = byTrigger[activeTab] || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>GIF Library</h2>
        <p style={{ color: 'var(--c-text-muted)', fontSize: '0.88rem', marginTop: 4 }}>
          Curate the GIFs shown to customers at your kiosk. Pick from Giphy via search; the kiosk caches them locally for instant playback.
        </p>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {TRIGGERS.map((t) => (
          <button
            key={t.key}
            className={`btn btn-sm ${activeTab === t.key ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
            {(byTrigger[t.key]?.length ?? 0) > 0 && (
              <span style={{ marginLeft: 6, opacity: 0.7 }}>· {byTrigger[t.key].length}</span>
            )}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong>{TRIGGERS.find((t) => t.key === activeTab)?.label}</strong>
            <button className="btn btn-secondary" onClick={() => setSearchOpen(true)}>+ Add GIF</button>
          </div>

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><Spinner /></div>
          ) : current.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--c-text-muted)' }}>
              No custom GIFs — using TapProve defaults.
            </div>
          ) : (
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12,
            }}>
              {current.map((g) => (
                <div key={g.id} style={{
                  background: '#11141B', borderRadius: 10, padding: 8,
                  display: 'flex', flexDirection: 'column', gap: 6,
                }}>
                  <img src={g.gif_url} alt="" style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 6 }} />
                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--c-danger)' }} onClick={() => remove(g)}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} onPick={addPick} />}
    </div>
  );
}

function SearchModal({ onClose, onPick }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  async function doSearch() {
    if (!q.trim()) return;
    setSearching(true);
    try {
      const d = await searchGiphy(q.trim());
      setResults(d.results || []);
    } catch {
      setResults([]);
    }
    setSearching(false);
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 12, padding: 18,
          width: '90vw', maxWidth: 720, maxHeight: '85vh', display: 'flex', flexDirection: 'column', gap: 12,
        }}
      >
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="input"
            placeholder="Search Giphy (e.g. welcome back)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && doSearch()}
            autoFocus
          />
          <button className="btn btn-primary" onClick={doSearch} disabled={searching}>
            {searching ? <Spinner white /> : 'Search'}
          </button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {results.length === 0 && !searching ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--c-text-muted)' }}>
              Search to find GIFs.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
              {results.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => onPick(g)}
                  style={{
                    border: 'none', padding: 0, background: 'transparent', cursor: 'pointer',
                  }}
                  title={g.title}
                >
                  <img src={g.preview_url || g.gif_url} alt="" style={{ width: '100%', height: 100, objectFit: 'cover', borderRadius: 6 }} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
