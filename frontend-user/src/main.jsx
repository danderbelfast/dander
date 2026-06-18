// ============================================================
//  Platform lockdown — maintenance mode.
//
//  Production builds render a blank white page; the dev server
//  (vite) renders the real app so we can iterate locally without
//  unlocking staging or production. import.meta.env.DEV is a Vite
//  build-time constant — true while running `vite`, false in every
//  `vite build` output — so the lockdown branch is the only one
//  that survives dead-code elimination in any shipped bundle.
//  Reverting this file (back to the unconditional white div)
//  restores the all-environments lockdown.
// ============================================================

import React from 'react';
import ReactDOM from 'react-dom/client';

const root = ReactDOM.createRoot(document.getElementById('root'));

if (import.meta.env.DEV || import.meta.env.VITE_UNLOCK_APP === 'true') {
  // Lazy-import App + provider tree so production builds never pull
  // them into the build graph at all.
  Promise.all([
    import('react-router-dom'),
    import('./styles/global.css').catch(() => null),
    import('leaflet/dist/leaflet.css').catch(() => null),
    import('./context/AuthContext.jsx'),
    import('./context/ToastContext.jsx'),
    import('./context/PwaInstallContext.jsx'),
    import('./App.jsx'),
  ]).then(([
    { BrowserRouter },
    _css1,
    _css2,
    { AuthProvider },
    { ToastProvider },
    { PwaInstallProvider },
    { default: App },
  ]) => {
    root.render(
      <React.StrictMode>
        <BrowserRouter>
          <AuthProvider>
            <ToastProvider>
              <PwaInstallProvider>
                <App />
              </PwaInstallProvider>
            </ToastProvider>
          </AuthProvider>
        </BrowserRouter>
      </React.StrictMode>
    );
  });
} else {
  root.render(<div style={{ minHeight: '100vh', backgroundColor: '#ffffff' }} />);
}
