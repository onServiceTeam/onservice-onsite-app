// Demo mode — one-tap admin access for UX testing.
//
// Gated on VITE_DEMO_MODE, set ONLY in the staging demo build. Production builds
// don't set it, so the demo button/auto-login are absent and normal email +
// password (+ 2FA) login is always the default. The demo credentials are read
// from build-time env (VITE_DEMO_ADMIN_*) so no password lives in the repo.
export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === '1';

export const DEMO_ADMIN = {
  email: (import.meta.env.VITE_DEMO_ADMIN_EMAIL as string | undefined) ?? '',
  password: (import.meta.env.VITE_DEMO_ADMIN_PASSWORD as string | undefined) ?? '',
};
