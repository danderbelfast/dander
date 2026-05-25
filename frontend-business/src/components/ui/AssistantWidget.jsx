import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { getAssistantSuggestions, sendAssistantMessage } from '../../api/business';
import { Spinner } from './Spinner';

// Map the current route to a coarse "page" key the backend understands.
function pageFromPath(pathname) {
  if (pathname.startsWith('/analytics')) return 'analytics';
  if (pathname.startsWith('/offers')) return 'offers';
  if (pathname.startsWith('/smart-specials')) return 'smart-specials';
  if (pathname.startsWith('/sensors')) return 'sensors';
  return 'dashboard';
}

const GREETING =
  "Hi! I'm your Dander assistant. Ask me anything about your footfall, "
  + 'offers, or what to focus on next — I look at your real numbers to answer.';

function Bubble({ role, children }) {
  const isUser = role === 'user';
  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
      <div style={{
        maxWidth: '85%',
        background: isUser ? 'var(--c-primary)' : 'var(--c-bg-muted)',
        color: isUser ? '#fff' : 'var(--c-text)',
        padding: '9px 13px',
        borderRadius: 'var(--r-md)',
        fontSize: '0.86rem',
        lineHeight: 1.5,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {children}
      </div>
    </div>
  );
}

export function AssistantWidget() {
  const location = useLocation();
  const page = pageFromPath(location.pathname);

  const [open, setOpen]               = useState(false);
  const [messages, setMessages]       = useState([]); // [{ role, content }]
  const [input, setInput]             = useState('');
  const [loading, setLoading]         = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [configured, setConfigured]   = useState(true);

  const threadRef = useRef(null);

  // Fetch page- and data-aware starter questions when the panel opens or the
  // page changes while it's open.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getAssistantSuggestions(page)
      .then((data) => {
        if (cancelled) return;
        setSuggestions(data.suggestions || []);
        if (typeof data.configured === 'boolean') setConfigured(data.configured);
      })
      .catch(() => { if (!cancelled) setSuggestions([]); });
    return () => { cancelled = true; };
  }, [open, page]);

  // Keep the thread scrolled to the latest message.
  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [messages, loading]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  async function send(text) {
    const content = text.trim();
    if (!content || loading) return;

    const nextMessages = [...messages, { role: 'user', content }];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);

    try {
      const { reply } = await sendAssistantMessage(nextMessages, page);
      setMessages([...nextMessages, { role: 'assistant', content: reply }]);
    } catch (err) {
      const code = err.response?.data?.code;
      const msg = code === 'NOT_CONFIGURED'
        ? 'The assistant is not available right now.'
        : code === 'RATE_LIMITED' || code === 'AI_RATE_LIMITED'
          ? 'You are sending messages a little fast — give it a moment and try again.'
          : 'Sorry, something went wrong. Please try again.';
      if (code === 'NOT_CONFIGURED') setConfigured(false);
      setMessages([...nextMessages, { role: 'assistant', content: msg }]);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    send(input);
  }

  return (
    <>
      {/* Floating button */}
      <button
        type="button"
        aria-label={open ? 'Close assistant' : 'Open AI assistant'}
        onClick={() => setOpen((v) => !v)}
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 901,
          width: 56, height: 56, borderRadius: 'var(--r-full)',
          background: 'var(--c-primary)', color: '#fff', border: 'none',
          fontSize: '1.5rem', cursor: 'pointer', boxShadow: 'var(--shadow-lg)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {open ? '✕' : '✨'}
      </button>

      {/* Backdrop */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          aria-hidden="true"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 900 }}
        />
      )}

      {/* Slide-out panel */}
      <aside
        role="dialog"
        aria-label="AI assistant"
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 902,
          width: 400, maxWidth: '100vw',
          background: 'var(--c-bg, #fff)',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex', flexDirection: 'column',
          transform: open ? 'translateX(0)' : 'translateX(105%)',
          transition: 'transform 0.25s ease',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', borderBottom: '1px solid var(--c-border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '1.2rem' }}>✨</span>
            <span style={{ fontWeight: 700, fontSize: '0.98rem' }}>Dander Assistant</span>
          </div>
          <button
            type="button" aria-label="Close" onClick={() => setOpen(false)}
            style={{ background: 'none', border: 'none', fontSize: '1.1rem', cursor: 'pointer', color: 'var(--c-text-muted)' }}
          >
            ✕
          </button>
        </div>

        {/* Thread */}
        <div ref={threadRef} style={{
          flex: 1, overflowY: 'auto', padding: 18,
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <Bubble role="assistant">{GREETING}</Bubble>

          {messages.map((m, i) => (
            <Bubble key={i} role={m.role}>{m.content}</Bubble>
          ))}

          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--c-text-muted)', fontSize: '0.82rem' }}>
              <Spinner /> Thinking…
            </div>
          )}

          {/* Suggested questions — shown until the user starts chatting */}
          {messages.length === 0 && configured && suggestions.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--c-text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Try asking
              </div>
              {suggestions.map((s, i) => (
                <button
                  key={i} type="button" onClick={() => send(s)} disabled={loading}
                  style={{
                    textAlign: 'left', background: 'var(--c-bg-muted)',
                    border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)',
                    padding: '9px 12px', fontSize: '0.83rem', cursor: 'pointer',
                    color: 'var(--c-text)', lineHeight: 1.4,
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {!configured && (
            <div style={{ fontSize: '0.8rem', color: 'var(--c-text-muted)', textAlign: 'center', padding: '8px 0' }}>
              The AI assistant is not available right now.
            </div>
          )}
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} style={{
          display: 'flex', gap: 8, padding: 14, borderTop: '1px solid var(--c-border)',
        }}>
          <input
            className="input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={configured ? 'Ask about your business…' : 'Assistant unavailable'}
            disabled={loading || !configured}
            style={{ flex: 1 }}
          />
          <button
            type="submit" className="btn btn-primary"
            disabled={loading || !configured || !input.trim()}
          >
            Send
          </button>
        </form>
      </aside>
    </>
  );
}
