import React from 'react';
import { getAuthPrompt } from '../../services/authPrompt';

// Value-framed banner shown on Register/Login when a logged-out user activated
// an offer — turns a cold auth screen into "create an account to save your offer".
export default function AuthPromptBanner() {
  const prompt = getAuthPrompt();
  if (!prompt) return null;
  return (
    <div className="card" style={{ margin: '0 0 16px', padding: 14, borderRadius: 12, background: 'rgba(255,107,53,0.10)', borderLeft: '3px solid #FF6B35' }}>
      <div style={{ fontWeight: 700 }}>🎟️ Create a free account to save your offer</div>
      <div className="text-muted" style={{ fontSize: '0.9rem', marginTop: 4 }}>
        {prompt.offerTitle
          ? <>Save <strong>{prompt.offerTitle}</strong> and redeem it in store at the till.</>
          : <>Save your offer and redeem it in store at the till.</>}
      </div>
    </div>
  );
}
