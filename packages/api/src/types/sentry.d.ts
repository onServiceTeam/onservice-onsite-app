declare module '@sentry/node' {
  export function init(options: {
    dsn: string;
    environment?: string;
    tracesSampleRate?: number;
    release?: string;
  }): void;
  export function setupExpressErrorHandler(app: import('express').Express): void;
}
