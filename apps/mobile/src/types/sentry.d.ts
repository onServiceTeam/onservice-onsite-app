declare module '@sentry/react-native' {
  import type { ComponentType } from 'react';
  export function init(options: {
    dsn: string;
    environment?: string;
    tracesSampleRate?: number;
    enableAutoSessionTracking?: boolean;
  }): void;
  export function wrap<T extends ComponentType<object>>(component: T): T;
}
