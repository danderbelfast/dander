import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import 'leaflet/dist/leaflet.css';
import './styles/global.css';

import { AuthProvider }       from './context/AuthContext';
import { ToastProvider }      from './context/ToastContext';
import { PwaInstallProvider } from './context/PwaInstallContext';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')).render(
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
