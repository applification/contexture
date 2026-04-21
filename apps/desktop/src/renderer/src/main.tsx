import * as Sentry from '@sentry/electron/renderer';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './globals.css';
import { initAnalytics } from './lib/analytics';
import { migrateLegacyStorageKeys } from './lib/migrate-storage';

const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const isProduction = import.meta.env.PROD;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: isProduction ? 'production' : 'development',
    enabled: isProduction,
  });
}

migrateLegacyStorageKeys();
initAnalytics();

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element not found');
ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
