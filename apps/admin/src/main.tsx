import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import * as Sentry from '@sentry/react';
import { Toaster } from 'sonner';
import App from './App';
import './index.css';

// Dev-only: surface axe-core a11y violations in the browser console.
// Tree-shaken from production builds via the import.meta.env.DEV guard.
if (import.meta.env.DEV) {
  void import('react-dom').then((ReactDOM) => {
    void import('@axe-core/react').then(({ default: axe }) => {
      void axe(React, ReactDOM, 1000);
    });
  });
}

// Initialize Sentry before any rendering. Guarded on env so dev without DSN is silent.
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
      <Toaster richColors position="top-right" closeButton />
    </BrowserRouter>
  </StrictMode>,
);
