import React, { useEffect, useState } from 'react';
import {
  getLoyaltySettings, saveLoyaltySettings,
  getLoyaltyMessages, addLoyaltyMessage, deleteLoyaltyMessage,
  previewLoyaltyGreeting,
  getLoyaltyRewards, addLoyaltyReward, updateLoyaltyReward, deleteLoyaltyReward,
  getLoyaltyCollectable, updateLoyaltyCollectable,
} from '../api/business';
import { useToast } from '../context/ToastContext';
import { Spinner } from '../components/ui/Spinner';

const TONES = [
  { value: 'professional', label: 'Professional', example: 'Welcome back. You have 250 loyalty points.' },
  { value: 'friendly',     label: 'Friendly',     example: 'Great to see you again — enjoy your visit!' },
  { value: 'cheeky',       label: 'Cheeky',       example: 'Back so soon? Loyalty looks good on you.' },
  { value: 'custom',       label: 'Custom',       example: 'Use the custom messages below to write your own.' },
];

const TRIGGERS = [
  { key: 'regular',                label: 'Regular visit' },
  { key: 'first_visit',            label: 'First visit' },
  { key: 'long_absence',           label: 'Long absence (3+ weeks)' },
  { key: 'already_visited_today',  label: 'Already visited today' },
  { key: 'milestone_10',           label: 'Milestone — 10th visit' },
  { key: 'milestone_50',           label: 'Milestone — 50th visit' },
  { key: 'milestone_100',          label: 'Milestone — 100th visit' },
];

const PREVIEW_TYPES = ['regular','first_visit','long_absence','milestone_10','milestone_50','milestone_100','already_visited_today'];

export default function LoyaltySettings() {
  const { toast } = useToast();
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [points, setPoints]     = useState(50);
  const [tone, setTone]         = useState('friendly');
  const [messages, setMessages] = useState([]);
  const [newTrigger, setNewTrigger] = useState('regular');
  const [newMessage, setNewMessage] = useState('');
  const [previewType, setPreviewType] = useState('regular');
  const [previewing, setPreviewing] = useState(false);
  const [previewCmd, setPreviewCmd] = useState(null);

  useEffect(() => {
    Promise.all([getLoyaltySettings(), getLoyaltyMessages()])
      .then(([s, m]) => {
        if (s?.settings) {
          setPoints(s.settings.points_per_visit ?? 50);
          setTone(s.settings.greeting_tone ?? 'friendly');
        }
        setMessages(m?.messages || []);
      })
      .catch(() => toast({ message: 'Failed to load loyalty settings.', type: 'error' }))
      .finally(() => setLoading(false));
  }, []);

  async function savePointsAndTone() {
    setSaving(true);
    try {
      await saveLoyaltySettings({ points_per_visit: points, greeting_tone: tone });
      toast({ message: 'Loyalty settings saved.', type: 'success' });
    } catch (err) {
      toast({ message: err.response?.data?.message || 'Save failed.', type: 'error' });
    }
    setSaving(false);
  }

  async function addMessage() {
    if (!newMessage.trim()) return;
    try {
      const { message } = await addLoyaltyMessage({ trigger: newTrigger, message: newMessage.trim() });
      setMessages((prev) => [message, ...prev]);
      setNewMessage('');
      toast({ message: 'Message added.', type: 'success' });
    } catch (err) {
      toast({ message: err.response?.data?.message || 'Failed to add message.', type: 'error' });
    }
  }

  async function deleteMessage(id) {
    try {
      await deleteLoyaltyMessage(id);
      setMessages((prev) => prev.filter((m) => m.id !== id));
    } catch {
      toast({ message: 'Failed to delete message.', type: 'error' });
    }
  }

  async function preview() {
    setPreviewing(true);
    setPreviewCmd(null);
    try {
      const { command } = await previewLoyaltyGreeting({ greeting_type: previewType });
      setPreviewCmd(command);
    } catch (err) {
      toast({ message: err.response?.data?.message || 'Preview failed.', type: 'error' });
    }
    setPreviewing(false);
  }

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}><Spinner /></div>;
  }

  const toneInfo = TONES.find((t) => t.value === tone) || TONES[1];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 720 }}>
      <div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>Loyalty Settings</h2>
        <p style={{ color: 'var(--c-text-muted)', fontSize: '0.88rem', marginTop: 4 }}>
          Configure how the Dander Node greets your customers and rewards repeat visits.
        </p>
      </div>

      <div className="card">
        <div className="card-header"><span className="card-title">Points</span></div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="field" style={{ maxWidth: 220 }}>
            <label className="label">Points per visit</label>
            <input
              className="input"
              type="number"
              min="0"
              max="10000"
              value={points}
              onChange={(e) => setPoints(parseInt(e.target.value, 10) || 0)}
            />
            <div className="field-hint">Awarded once per UTC day per customer.</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><span className="card-title">Greeting tone</span></div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
            {TONES.map((t) => (
              <label key={t.value} style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                <input type="radio" name="tone" checked={tone === t.value} onChange={() => setTone(t.value)} />
                {t.label}
              </label>
            ))}
          </div>
          <div style={{
            padding: 12, borderRadius: 8, background: 'var(--c-bg-subtle, #f7f7f8)',
            fontSize: '0.88rem', color: 'var(--c-text)',
          }}>
            <strong style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--c-text-muted)' }}>
              Example
            </strong>
            <div style={{ marginTop: 4 }}>{toneInfo.example}</div>
          </div>
        </div>
      </div>

      <button className="btn btn-primary" onClick={savePointsAndTone} disabled={saving} style={{ alignSelf: 'flex-start' }}>
        {saving ? <Spinner white /> : 'Save points & tone'}
      </button>

      <div className="card">
        <div className="card-header"><span className="card-title">Custom messages</span></div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ color: 'var(--c-text-muted)', fontSize: '0.86rem', marginTop: 0 }}>
            Override the default greeting per trigger. Use <code>{'{name}'}</code>, <code>{'{visits}'}</code>, <code>{'{points}'}</code>
            and <code>{'{last_visit}'}</code> for substitutions. If you add multiple messages per trigger we'll pick one at random.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr auto', gap: 8, alignItems: 'center' }}>
            <select className="input" value={newTrigger} onChange={(e) => setNewTrigger(e.target.value)}>
              {TRIGGERS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
            <input
              className="input"
              placeholder="e.g. Welcome back {name}! Have {points} points."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              maxLength={500}
            />
            <button className="btn btn-secondary" onClick={addMessage} disabled={!newMessage.trim()}>Add</button>
          </div>

          {messages.length === 0 ? (
            <div style={{ color: 'var(--c-text-muted)', fontSize: '0.85rem' }}>
              No custom messages yet — using the built-in defaults.
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Trigger</th><th>Message</th><th></th></tr></thead>
                <tbody>
                  {messages.map((m) => (
                    <tr key={m.id}>
                      <td>{TRIGGERS.find((t) => t.key === m.trigger)?.label || m.trigger}</td>
                      <td>{m.message}</td>
                      <td>
                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--c-danger)' }} onClick={() => deleteMessage(m.id)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header"><span className="card-title">GIF preview</span></div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ color: 'var(--c-text-muted)', fontSize: '0.86rem', marginTop: 0 }}>
            Test what Claude + Giphy come up with for a given trigger using your current tone.
            Nothing is saved.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <select className="input" value={previewType} onChange={(e) => setPreviewType(e.target.value)} style={{ maxWidth: 260 }}>
              {PREVIEW_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <button className="btn btn-secondary" onClick={preview} disabled={previewing}>
              {previewing ? <Spinner /> : 'Test GIF'}
            </button>
          </div>
          {previewCmd && (
            <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
              <div style={{ width: 220, height: 220, background: '#000', borderRadius: 8, overflow: 'hidden' }}>
                {previewCmd.gif_url
                  ? <img src={previewCmd.gif_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <div style={{ color: '#888', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                      No GIF — text only fallback
                    </div>}
              </div>
              <div style={{ flex: 1, fontSize: '0.92rem' }}>
                <div><strong>Message:</strong> {previewCmd.message}</div>
                <div style={{ marginTop: 6, color: 'var(--c-text-muted)' }}>
                  Giphy term: <code>{previewCmd.search_term}</code> · Trigger: <code>{previewCmd.greeting_type}</code>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <RewardJourneySection />
      <CollectableSection />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reward Journey — the 4-tier (or N-tier) progression customers see.
// ---------------------------------------------------------------------------

function RewardJourneySection() {
  const { toast } = useToast();
  const [rewards, setRewards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState({ name: '', emoji: '🎁', points_required: '' });

  useEffect(() => {
    getLoyaltyRewards().then((d) => setRewards(d.rewards || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function add() {
    const points = parseInt(draft.points_required, 10);
    if (!draft.name.trim() || !Number.isFinite(points) || points <= 0) {
      toast({ message: 'Name and positive points required.', type: 'error' }); return;
    }
    try {
      const r = await addLoyaltyReward({
        name: draft.name.trim(), emoji: draft.emoji.trim() || '🎁', points_required: points,
      });
      setRewards((prev) => [...prev, r.reward].sort((a, b) => a.points_required - b.points_required));
      setDraft({ name: '', emoji: '🎁', points_required: '' });
    } catch (err) { toast({ message: err.response?.data?.message || 'Failed to add.', type: 'error' }); }
  }

  async function save(reward, patch) {
    try {
      const r = await updateLoyaltyReward(reward.id, patch);
      setRewards((prev) => prev.map((x) => x.id === reward.id ? r.reward : x).sort((a, b) => a.points_required - b.points_required));
    } catch (err) { toast({ message: err.response?.data?.message || 'Failed to save.', type: 'error' }); }
  }

  async function remove(reward) {
    if (!window.confirm(`Delete "${reward.name}"?`)) return;
    try {
      await deleteLoyaltyReward(reward.id);
      setRewards((prev) => prev.filter((r) => r.id !== reward.id));
    } catch (err) { toast({ message: err.response?.data?.message || 'Failed to delete.', type: 'error' }); }
  }

  return (
    <div className="card">
      <div className="card-header"><span className="card-title">Reward Journey</span></div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={{ color: 'var(--c-text-muted)', fontSize: '0.86rem', marginTop: 0 }}>
          The reward markers customers see on their loyalty meter. Add as many as you want; they're shown in
          ascending point order on the customer's app.
        </p>
        {loading ? <Spinner /> : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Emoji</th><th>Name</th><th>Points</th><th></th></tr></thead>
                <tbody>
                  {rewards.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <input className="input" style={{ width: 60 }} value={r.emoji}
                          onChange={(e) => setRewards((prev) => prev.map((x) => x.id === r.id ? { ...x, emoji: e.target.value } : x))}
                          onBlur={(e) => save(r, { emoji: e.target.value })} />
                      </td>
                      <td>
                        <input className="input" value={r.name}
                          onChange={(e) => setRewards((prev) => prev.map((x) => x.id === r.id ? { ...x, name: e.target.value } : x))}
                          onBlur={(e) => save(r, { name: e.target.value })} />
                      </td>
                      <td>
                        <input className="input" type="number" min="1" style={{ width: 100 }} value={r.points_required}
                          onChange={(e) => setRewards((prev) => prev.map((x) => x.id === r.id ? { ...x, points_required: parseInt(e.target.value, 10) || 0 } : x))}
                          onBlur={(e) => save(r, { points_required: parseInt(e.target.value, 10) || 1 })} />
                      </td>
                      <td>
                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--c-danger)' }} onClick={() => remove(r)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 120px auto', gap: 8, alignItems: 'center' }}>
              <input className="input" value={draft.emoji} onChange={(e) => setDraft({ ...draft, emoji: e.target.value })} />
              <input className="input" placeholder="Reward name (e.g. Free Coffee)" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              <input className="input" type="number" min="1" placeholder="Points" value={draft.points_required} onChange={(e) => setDraft({ ...draft, points_required: e.target.value })} />
              <button className="btn btn-secondary" onClick={add}>+ Add</button>
            </div>
            <RewardPreview rewards={rewards} />
          </>
        )}
      </div>
    </div>
  );
}

function RewardPreview({ rewards }) {
  const sorted = [...rewards].sort((a, b) => a.points_required - b.points_required);
  const max = sorted[sorted.length - 1]?.points_required || 1;
  return (
    <div style={{ background: '#11141B', borderRadius: 10, padding: 14, color: '#fff', marginTop: 6 }}>
      <div style={{ fontSize: 11, letterSpacing: 2, color: '#9aa4b1' }}>CUSTOMER PREVIEW</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
        {sorted.map((r) => <span key={r.id} style={{ fontSize: 20, opacity: 0.4 }}>{r.emoji}</span>)}
      </div>
      <div style={{ height: 10, background: '#1F2530', borderRadius: 6, marginTop: 6 }}>
        <div style={{ width: '0%', height: '100%', background: '#FF6B35', borderRadius: 6 }} />
      </div>
      <div style={{ color: '#9aa4b1', fontSize: 12, marginTop: 8 }}>
        {sorted.length === 0 ? 'No rewards yet.' : `Next: ${sorted[0].emoji} ${sorted[0].name} — ${sorted[0].points_required} points away`}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collectable Manager — auto-assigned per business, fully editable.
// ---------------------------------------------------------------------------

function CollectableSection() {
  const { toast } = useToast();
  const [c, setC] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getLoyaltyCollectable().then((d) => setC(d.collectable)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function save(patch) {
    try {
      const r = await updateLoyaltyCollectable(patch);
      setC(r.collectable);
      toast({ message: 'Collectable saved.', type: 'success' });
    } catch (err) { toast({ message: err.response?.data?.message || 'Failed to save.', type: 'error' }); }
  }

  if (loading) {
    return <div className="card"><div className="card-body"><Spinner /></div></div>;
  }
  if (!c) {
    return (
      <div className="card">
        <div className="card-header"><span className="card-title">Your Business Collectable</span></div>
        <div className="card-body" style={{ color: 'var(--c-text-muted)' }}>
          No collectable assigned yet — re-run migration 045 or contact support.
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header"><span className="card-title">Your Business Collectable</span></div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={{ color: 'var(--c-text-muted)', fontSize: '0.86rem', marginTop: 0 }}>
          Customers earn this collectable by visiting your business {c.unlock_visits} times. Optional evolution makes it
          even rarer at a higher visit count.
        </p>
        <div style={{ display: 'flex', gap: 24, alignItems: 'center', padding: 14, background: 'var(--c-bg-subtle, #f7f7f8)', borderRadius: 10 }}>
          <div style={{ fontSize: 60 }}>{c.emoji}</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{c.name}</div>
            <div style={{ fontSize: 12, color: 'var(--c-text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>{c.rarity}</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Unlocks after {c.unlock_visits} visits</div>
          </div>
        </div>
        <div className="form-grid">
          <div className="field">
            <label className="label">Name</label>
            <input className="input" defaultValue={c.name} onBlur={(e) => save({ name: e.target.value })} />
          </div>
          <div className="field">
            <label className="label">Emoji</label>
            <input className="input" defaultValue={c.emoji} onBlur={(e) => save({ emoji: e.target.value })} />
          </div>
          <div className="field">
            <label className="label">Unlock at N visits</label>
            <input className="input" type="number" min="1" defaultValue={c.unlock_visits} onBlur={(e) => save({ unlock_visits: parseInt(e.target.value, 10) })} />
          </div>
        </div>
        <details>
          <summary style={{ cursor: 'pointer', color: 'var(--c-text-muted)' }}>Optional evolution</summary>
          <div className="form-grid" style={{ marginTop: 10 }}>
            <div className="field">
              <label className="label">Evolved emoji</label>
              <input className="input" defaultValue={c.evolved_emoji || ''} onBlur={(e) => save({ evolved_emoji: e.target.value })} />
            </div>
            <div className="field">
              <label className="label">Evolved name</label>
              <input className="input" defaultValue={c.evolved_name || ''} onBlur={(e) => save({ evolved_name: e.target.value })} />
            </div>
            <div className="field">
              <label className="label">Evolved at N visits</label>
              <input className="input" type="number" min="1" defaultValue={c.evolved_visits || ''} onBlur={(e) => save({ evolved_visits: parseInt(e.target.value, 10) || null })} />
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}
