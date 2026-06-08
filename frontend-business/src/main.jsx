// ============================================================
//  Platform lockdown — maintenance mode.
//
//  Entire app render is replaced with a blank white page. The rest
//  of the codebase (App.jsx, AuthProvider, ToastProvider, every
//  page) is intact on disk so reverting this file restores the app.
// ============================================================

import React from 'react';
import ReactDOM from 'react-dom/client';

ReactDOM.createRoot(document.getElementById('root')).render(
  <div style={{ minHeight: '100vh', backgroundColor: '#ffffff' }} />
);
