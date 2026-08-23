import React, { useState, useRef, useEffect, type FormEvent } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { useNavigate, Navigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { useAuthStore, type AdminUser } from '@/stores/auth.store';
import api, { getErrorMessage } from '@/lib/api';
import { Label, Input } from '@/components/ui';
import { DEMO_MODE, DEMO_ADMIN } from '@/config/demo';

export default function LoginPage(): React.ReactElement {
  const navigate = useNavigate();
  const { isAuthenticated, login } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // 2FA state
  const [requires2FA, setRequires2FA] = useState(false);
  const [preAuthToken, setPreAuthToken] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const totpInputRef = useRef<HTMLInputElement>(null);

  // 2FA force-enrollment state
  const [requires2FASetup, setRequires2FASetup] = useState(false);
  const [setupSecret, setSetupSecret] = useState('');
  const [setupUri, setSetupUri] = useState('');
  const [setupQrDataUrl, setSetupQrDataUrl] = useState('');
  const [enrolCode, setEnrolCode] = useState('');

  // Render the otpauth URI to a scannable QR image (client-side; the secret is
  // never sent anywhere). Without this the screen showed only a raw secret
  // string, which non-technical admins could not act on.
  useEffect(() => {
    if (!setupUri) { setSetupQrDataUrl(''); return; }
    let cancelled = false;
    QRCode.toDataURL(setupUri, { width: 220, margin: 1 })
      .then((url) => { if (!cancelled) setSetupQrDataUrl(url); })
      .catch(() => { if (!cancelled) setSetupQrDataUrl(''); });
    return () => { cancelled = true; };
  }, [setupUri]);

  // Demo mode (staging UX testing) — one-tap admin entry using the build-time
  // demo credentials. 2FA is off on staging, so this lands straight in. Defined
  // here (above the early return) so its hook (the deep-link effect below) is
  // always called in the same order per React's Rules of Hooks.
  const handleDemoLogin = async (): Promise<void> => {
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/api/v1/auth/admin/login', {
        email: DEMO_ADMIN.email,
        password: DEMO_ADMIN.password,
      });
      const data = res.data.data;
      if (data.requires2FA || data.requires2FASetup) {
        setError('Demo entry unavailable while admin 2FA is enabled.');
        setLoading(false);
        return;
      }
      completeLogin(data.user, { mustRotatePassword: data.mustRotatePassword === true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // ?demo=1 deep link auto-signs-in as admin (demo build only). Once on mount.
  const demoFired = useRef(false);
  useEffect(() => {
    if (
      DEMO_MODE &&
      !demoFired.current &&
      !isAuthenticated &&
      new URLSearchParams(window.location.search).get('demo') === '1'
    ) {
      demoFired.current = true;
      void handleDemoLogin();
    }
  }, []);

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await api.post('/api/v1/auth/admin/login', { email, password });
      const data = res.data.data;

      // Check if 2FA is required
      if (data.requires2FA) {
        setRequires2FA(true);
        setPreAuthToken(data.preAuthToken);
        setLoading(false);
        setTimeout(() => totpInputRef.current?.focus(), 100);
        return;
      }

      // Force 2FA enrollment for admins without TOTP yet
      if (data.requires2FASetup) {
        setPreAuthToken(data.preAuthToken);
        setRequires2FASetup(true);
        // Kick off setup immediately to fetch secret + otpauth URI
        try {
          const setupRes = await api.post(
            '/api/v1/auth/admin/2fa/setup',
            {},
            { headers: { Authorization: `Bearer ${data.preAuthToken}` } },
          );
          setSetupSecret(setupRes.data.data.secret);
          setSetupUri(setupRes.data.data.uri);
        } catch (setupErr) {
          setError(getErrorMessage(setupErr));
        }
        setLoading(false);
        return;
      }

      // Bug 1251 fix: server set cookies on the response. We only need the
      // user payload for client-side state.
      // LL#12 — surface mustRotatePassword from the response so the
      // route guard can redirect to /change-password.
      const { user, mustRotatePassword } = data;
      completeLogin(user, { mustRotatePassword: mustRotatePassword === true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handle2FAVerify = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await api.post('/api/v1/auth/admin/2fa/verify', { preAuthToken, totpCode });
      const { user, mustRotatePassword } = res.data.data;
      completeLogin(user, { mustRotatePassword: mustRotatePassword === true });
    } catch (err) {
      setError(getErrorMessage(err));
      setTotpCode('');
    } finally {
      setLoading(false);
    }
  };

  const handle2FAEnrol = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post(
        '/api/v1/auth/admin/2fa/enable',
        { totpCode: enrolCode },
        { headers: { Authorization: `Bearer ${preAuthToken}` } },
      );
      const { user } = res.data.data;
      if (!user) {
        setError('Enrollment completed but session was not issued. Please log in again.');
        setRequires2FASetup(false);
        setPreAuthToken('');
        return;
      }
      const { mustRotatePassword } = res.data.data;
      completeLogin(user, { mustRotatePassword: mustRotatePassword === true });
    } catch (err) {
      setError(getErrorMessage(err));
      setEnrolCode('');
    } finally {
      setLoading(false);
    }
  };

  const completeLogin = (
    user: Record<string, unknown>,
    opts: { mustRotatePassword?: boolean } = {},
  ): void => {
    const role = user.role as string;
    // E01 / D15 — DPO is admin-tier and must reach the admin app.
    if (role !== 'admin' && role !== 'super_admin' && role !== 'dpo') {
      setError('Access denied. Admin privileges required.');
      return;
    }

    const adminUser: AdminUser = {
      id: user.id as string,
      email: user.email as string,
      phone: user.phone as string,
      firstName: user.firstName as string,
      lastName: user.lastName as string,
      role: role as 'admin' | 'super_admin' | 'dpo',
      avatarUrl: user.avatarUrl as string | null,
    };

    login(adminUser, { mustRotatePassword: opts.mustRotatePassword === true });
    // LL#12 — when must rotate, route guard at App level redirects to
    // /change-password regardless of where we navigate. Going to root
    // is fine because the guard intercepts first.
    navigate(opts.mustRotatePassword ? '/change-password' : '/');
  };

  // 2FA force-enrollment step (admin/super_admin without TOTP)
  if (requires2FASetup) {
    return (
      <main className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-[var(--color-text)]">
              <span className="text-[var(--color-primary)]">on</span>Service
            </h1>
            <p className="text-sm text-[var(--color-text-secondary)] mt-1">Admin Panel</p>
          </div>

          <form
            onSubmit={(e) => void handle2FAEnrol(e)}
            className="bg-white rounded-xl border border-[var(--color-border)] p-6 shadow-sm"
          >
            <h2 className="text-lg font-semibold text-[var(--color-text)] mb-2">Set Up Two-Factor Authentication</h2>
            <p className="text-sm text-[var(--color-text-secondary)] mb-4">
              This is a one-time setup, required for all admin accounts.
            </p>
            <ol className="text-sm text-[var(--color-text-secondary)] mb-4 list-decimal pl-5 space-y-1">
              <li>Install an authenticator app on your phone (Google Authenticator, Microsoft Authenticator, or Authy).</li>
              <li>Scan the QR code below with that app (or tap &ldquo;Enter a setup key&rdquo; and type the secret).</li>
              <li>Enter the 6-digit code the app shows, then press <strong>Enable &amp; Sign In</strong>.</li>
            </ol>

            {error && (
              <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            )}

            {setupSecret ? (
              <>
                {setupQrDataUrl && (
                  <div className="mb-4 flex justify-center">
                    <img
                      src={setupQrDataUrl}
                      alt="Two-factor authentication QR code"
                      width={220}
                      height={220}
                      className="border border-[var(--color-border)] rounded-lg bg-white p-2"
                    />
                  </div>
                )}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">
                    Can&rsquo;t scan? Enter this setup key manually:
                  </label>
                  <code className="block w-full px-3 py-2 bg-gray-50 border border-[var(--color-border)] rounded-lg text-xs font-mono break-all select-all">
                    {setupSecret}
                  </code>
                </div>
              </>
            ) : (
              <p className="mb-4 text-sm text-[var(--color-text-secondary)]">Generating QR code&hellip;</p>
            )}

            <div className="mb-5">
              <Label htmlFor="enrol-totp" className="block text-sm font-medium text-[var(--color-text)] mb-1.5">
                6-digit code from your authenticator app
              </Label>
              <Input
                id="enrol-totp"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                value={enrolCode}
                onChange={(e) => setEnrolCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
                placeholder="000000"
                className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm text-center tracking-[0.3em] font-mono text-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)] focus:border-transparent"
              />
            </div>

            <button
              type="submit"
              disabled={loading || enrolCode.length !== 6 || !setupSecret}
              className="w-full py-2.5 bg-[var(--color-primary)] text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:bg-slate-200 disabled:text-slate-600 disabled:cursor-not-allowed transition-opacity"
            >
              {loading ? 'Enabling...' : 'Enable & Sign In'}
            </button>

            <button
              type="button"
              onClick={() => {
                setRequires2FASetup(false);
                setPreAuthToken('');
                setEnrolCode('');
                setSetupSecret('');
                setSetupUri('');
                setError('');
              }}
              className="w-full mt-3 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
            >
              Back to login
            </button>
          </form>
        </div>
      </main>
    );
  }

  // 2FA verification step
  if (requires2FA) {
    return (
      <main className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-[var(--color-text)]">
              <span className="text-[var(--color-primary)]">on</span>Service
            </h1>
            <p className="text-sm text-[var(--color-text-secondary)] mt-1">Admin Panel</p>
          </div>

          <form
            onSubmit={(e) => void handle2FAVerify(e)}
            className="bg-white rounded-xl border border-[var(--color-border)] p-6 shadow-sm"
          >
            <h2 className="text-lg font-semibold text-[var(--color-text)] mb-2">Two-Factor Authentication</h2>
            <p className="text-sm text-[var(--color-text-secondary)] mb-5">
              Enter the 6-digit code from your authenticator app.
            </p>

            {error && (
              <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="mb-5">
              <Label htmlFor="login-totp" className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Verification code</Label>
              <Input
                id="login-totp"
                ref={totpInputRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
                autoFocus
                placeholder="000000"
                className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm text-center tracking-[0.3em] font-mono text-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)] focus:border-transparent"
              />
            </div>

            <button
              type="submit"
              disabled={loading || totpCode.length !== 6}
              className="w-full py-2.5 bg-[var(--color-primary)] text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:bg-slate-200 disabled:text-slate-600 disabled:cursor-not-allowed transition-opacity"
            >
              {loading ? 'Verifying...' : 'Verify'}
            </button>

            <button
              type="button"
              onClick={() => { setRequires2FA(false); setPreAuthToken(''); setTotpCode(''); setError(''); }}
              className="w-full mt-3 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
            >
              Back to login
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-[var(--color-text)]">
            <span className="text-[var(--color-primary)]">on</span>Service
          </h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">Admin Panel</p>
        </div>

        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="bg-white rounded-xl border border-[var(--color-border)] p-6 shadow-sm"
        >
          <h2 className="text-lg font-semibold text-[var(--color-text)] mb-5">Sign In</h2>

          {error && (
            <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="mb-4">
            <Label htmlFor="login-email" className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Email</Label>
            <Input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              placeholder="admin@onservice.ph"
              className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)] focus:border-transparent"
            />
          </div>

          <div className="mb-5">
            <Label htmlFor="login-password" className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Password</Label>
            <Input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)] focus:border-transparent"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full py-2.5 bg-[var(--color-primary)] text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:bg-slate-200 disabled:text-slate-600 disabled:cursor-not-allowed transition-opacity"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>

          {DEMO_MODE && (
            <button
              type="button"
              onClick={() => void handleDemoLogin()}
              disabled={loading}
              className="w-full mt-3 py-2.5 border border-[var(--color-border)] text-[var(--color-text)] text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Entering…' : 'Enter as Admin (demo)'}
            </button>
          )}
        </form>

        <p className="text-center text-xs text-[var(--color-text-secondary)] mt-4">
          Authorized personnel only
        </p>
      </div>
    </main>
  );
}
