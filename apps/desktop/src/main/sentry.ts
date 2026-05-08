import * as Sentry from '@sentry/electron/main';
import { app } from 'electron';
import { ENV } from 'varlock/env';

export function initSentryMain(): void {
  const dsn = ENV.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    release: `contexture@${app.getVersion()}`,
    environment: app.isPackaged ? 'production' : 'development',
    enabled: app.isPackaged,
  });
}
