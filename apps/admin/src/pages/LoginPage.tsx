import React, { useState, useRef, useEffect, type FormEvent, type ReactNode } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { useNavigate, Navigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { useAuthStore, type AdminUser } from '@/stores/auth.store';
import api, { getErrorMessage } from '@/lib/api';
import { Button, Label, Input } from '@/components/ui';
import BrandMark from '@/components/BrandMark';
import { DEMO_MODE, DEMO_ADMIN } from '@/config/demo';
import { Loader2, RefreshCw } from 'lucide-react';

const ADMIN_2FA_SETUP_TIMEOUT_MS = 15_000;

function AdminAuthShell({
  title,
  description,
  children,
  wide = false,
}: {
  title: string;
  description: string;
  children: ReactNode;
  wide?: boolean;
}): React.ReactElement {
  return (
    <main className="min-h-screen bg-[var(--color-bg)] md:grid md:grid-cols-[minmax(280px,0.85fr)_minmax(420px,1.15fr)]">
      <section
        aria-label="onService operations context"
        className="relative hidden overflow-hidden bg-[var(--color-primary)] px-10 py-12 text-white md:flex md:flex-col md:justify-between lg:px-16 lg:py-16"
      >
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full border border-white/15" />
        <div className="absolute -bottom-40 -left-32 h-96 w-96 rounded-full bg-[var(--color-secondary)]/25" />
        {/* UX-1392: the house logo, the same mark as the sidebar and the phone
            app's sign-in panel (Ken, 2026-10-14). This panel is brand blue, so
            the tile is white with a blue house, and "onService PH" is one
            colour. The orange accent is never part of the brand mark. */}
        <div className="relative z-10 flex items-center gap-3" data-testid="admin-login-brand">
          <BrandMark tone="onDark" size={48} />
          <div>
            <p className="text-2xl font-bold tracking-tight">onService PH</p>
            <p className="text-sm font-medium text-white/75">Philippines operations console</p>
          </div>
        </div>

        <div className="relative z-10 max-w-lg">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">Company workspace</p>
          <h2 className="mt-4 text-3xl font-semibold leading-tight lg:text-4xl">
            Operate every service journey from one trusted workspace.
          </h2>
          <p className="mt-4 max-w-md text-sm leading-6 text-white/75 lg:text-base">
            Support customers, coordinate providers, resolve exceptions, and protect the business with a connected record of every action.
          </p>
          <ul className="mt-8 space-y-4 text-sm text-white/90" aria-label="Operations workspace capabilities">
            {[
              'Booking, dispatch, and support context in one place',
              'Provider vetting, quality, compliance, and payouts',
              'Auditable decisions for customer and company protection',
            ].map((item) => (
              <li key={item} className="flex items-start gap-3">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-white/80" aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative z-10 text-xs text-white/60">Restricted to authorized onService personnel</p>
      </section>

      <section
        aria-label="Admin authentication workspace"
        className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8 md:px-10 lg:px-16"
      >
        <div className={`w-full ${wide ? 'max-w-xl' : 'max-w-md'}`}>
          {/* UX-1392: below 768px the logo sits on the light page, so the tile
              is brand blue with a white house. */}
          <div className="mb-8 flex items-center gap-3 md:hidden" data-testid="admin-login-brand-compact">
            <BrandMark tone="onLight" size={48} />
            <div>
              <p className="text-2xl font-bold tracking-tight text-[var(--color-text)]">onService PH</p>
              <p className="text-sm text-[var(--color-text-secondary)]">Philippines operations console</p>
            </div>
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-primary)]">Admin operations</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--color-text)]">{title}</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--color-text-secondary)]">{description}</p>
          <div className="mt-8">{children}</div>
          <p className="mt-5 text-sm text-[var(--color-text-secondary)]">
            Access is monitored and administrative actions are recorded.
          </p>
        </div>
      </section>
    </main>
  );
}

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
  const [usingBackupCode, setUsingBackupCode] = useState(false);
  const [backupCode, setBackupCode] = useState('');
  const totpInputRef = useRef<HTMLInputElement>(null);

  // D37: details the server adds to an email-code error (read by shape, so it
  // also works with any API error wrapper).
  const emailErrorDetail = (err: unknown): { code?: string; retryAfterMs?: unknown } =>
    ((err as { body?: { error?: { code?: string; retryAfterMs?: unknown } } } | null)?.body?.error) ?? {};

  // D37 (Ken, 2026-10-11): emailed second step (server ADMIN_SECOND_FACTOR=email).
  // The code works for 5 minutes from when it was first sent; "Resend code"
  // re-sends the SAME code inside that window, and a fresh one after it.
  const [requiresEmailCode, setRequiresEmailCode] = useState(false);
  const [emailHint, setEmailHint] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [emailExpiresAt, setEmailExpiresAt] = useState(0);
  const [emailResendAt, setEmailResendAt] = useState(0);
  const [emailSending, setEmailSending] = useState(false);
  const [emailNotice, setEmailNotice] = useState('');
  // The authenticator path, offered as the other way in when it is set up.
  const [totpFallbackToken, setTotpFallbackToken] = useState('');
  // Re-render twice a second; the time is read fresh on every render.
  const [, setClockTick] = useState(0);
  const emailInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!requiresEmailCode) return undefined;
    const timer = setInterval(() => setClockTick(value => value + 1), 500);
    return () => clearInterval(timer);
  }, [requiresEmailCode]);

  // 2FA force-enrollment state
  const [requires2FASetup, setRequires2FASetup] = useState(false);
  const [setupSecret, setSetupSecret] = useState('');
  const [setupUri, setSetupUri] = useState('');
  const [setupQrDataUrl, setSetupQrDataUrl] = useState('');
  const [setupLoading, setSetupLoading] = useState(false);
  const [enrolCode, setEnrolCode] = useState('');
  const [issuedBackupCodes, setIssuedBackupCodes] = useState<string[]>([]);
  const [backupCodesSaved, setBackupCodesSaved] = useState(false);
  const [backupCodesCopied, setBackupCodesCopied] = useState(false);
  const [backupCodesCopying, setBackupCodesCopying] = useState(false);
  const [enrolledUser, setEnrolledUser] = useState<Record<string, unknown> | null>(null);
  const [enrolledMustRotate, setEnrolledMustRotate] = useState(false);

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
      if (data.requires2FA || data.requires2FASetup || data.requiresEmailCode) {
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

  const load2FASetup = async (token: string): Promise<void> => {
    setError('');
    setSetupLoading(true);
    setSetupSecret('');
    setSetupUri('');
    setSetupQrDataUrl('');
    setEnrolCode('');
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const setupRes = await Promise.race([
        api.post(
          '/api/v1/auth/admin/2fa/setup',
          {},
          { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal },
        ),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            controller.abort();
            reject(new Error('Admin 2FA setup request timed out.'));
          }, ADMIN_2FA_SETUP_TIMEOUT_MS);
        }),
      ]);
      setSetupSecret(setupRes.data.data.secret);
      setSetupUri(setupRes.data.data.uri);
    } catch {
      setError('We could not generate the setup key. Try again. If this temporary sign-in expired, return to login and sign in again.');
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      setSetupLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await api.post('/api/v1/auth/admin/login', { email, password });
      const data = res.data.data;

      // D37: emailed second step.
      if (data.requiresEmailCode) {
        const now = Date.now();
        setPreAuthToken(data.preAuthToken);
        setEmailHint(typeof data.emailHint === 'string' ? data.emailHint : '');
        setEmailExpiresAt(now + Number(data.expiresInMs ?? 0));
        setEmailResendAt(now + Number(data.resendInMs ?? 0));
        setEmailCode('');
        setTotpFallbackToken(typeof data.totpPreAuthToken === 'string' ? data.totpPreAuthToken : '');
        setEmailNotice(data.codeAlreadySent === true
          ? 'We already sent you a code a moment ago. Enter it below.'
          : data.delivery === 'unknown'
            ? "We couldn't confirm the email went out. If it doesn't arrive within a minute, use Resend."
            : '');
        setRequiresEmailCode(true);
        setPassword('');
        setLoading(false);
        setTimeout(() => emailInputRef.current?.focus(), 100);
        return;
      }

      // Check if 2FA is required
      if (data.requires2FA) {
        setRequires2FA(true);
        setPreAuthToken(data.preAuthToken);
        setPassword('');
        setLoading(false);
        setTimeout(() => totpInputRef.current?.focus(), 100);
        return;
      }

      // Force 2FA enrollment for admins without TOTP yet
      if (data.requires2FASetup) {
        setPreAuthToken(data.preAuthToken);
        setRequires2FASetup(true);
        setPassword('');
        await load2FASetup(data.preAuthToken);
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
      const res = await api.post('/api/v1/auth/admin/2fa/verify', usingBackupCode
        ? { preAuthToken, backupCode }
        : { preAuthToken, totpCode });
      const { user, mustRotatePassword } = res.data.data;
      completeLogin(user, { mustRotatePassword: mustRotatePassword === true });
    } catch (err) {
      setError(getErrorMessage(err));
      if (usingBackupCode) setBackupCode('');
      else setTotpCode('');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailCodeVerify = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setError('');
    setEmailNotice('');
    setLoading(true);
    try {
      const res = await api.post('/api/v1/auth/admin/email-code/verify', { preAuthToken, code: emailCode });
      const { user, mustRotatePassword } = res.data.data;
      completeLogin(user, { mustRotatePassword: mustRotatePassword === true });
    } catch (err) {
      const code = emailErrorDetail(err).code;
      if (code === 'email_code_expired' || code === 'email_code_not_found' || code === 'email_code_attempts_exhausted') {
        setEmailExpiresAt(Date.now());
        setEmailResendAt(Date.now());
      }
      setError(getErrorMessage(err));
      setEmailCode('');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailCodeResend = async (): Promise<void> => {
    // Honour the server's wait, after expiry too.
    if (emailSending || emailResendAt > Date.now()) return;
    setError('');
    setEmailNotice('');
    setEmailSending(true);
    try {
      const res = await api.post('/api/v1/auth/admin/email-code/resend', { preAuthToken });
      const data = res.data.data as { resent?: boolean; expiresInMs?: number; resendInMs?: number; delivery?: string };
      const now = Date.now();
      setEmailExpiresAt(now + Number(data.expiresInMs ?? 0));
      setEmailResendAt(now + Number(data.resendInMs ?? 0));
      setEmailCode('');
      setEmailNotice(data.delivery === 'unknown'
        ? "We couldn't confirm the email went out. If it doesn't arrive within a minute, use Resend."
        : data.resent
          ? 'We sent the same code again. Check your inbox and spam folder.'
          : 'We sent you a new code. It works for 5 minutes.');
    } catch (err) {
      const retryAfterMs = Number(emailErrorDetail(err).retryAfterMs);
      if (Number.isFinite(retryAfterMs) && retryAfterMs > 0) setEmailResendAt(Date.now() + retryAfterMs);
      setError(getErrorMessage(err));
    } finally {
      setEmailSending(false);
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
      const codes = Array.isArray(res.data.data.backupCodes)
        ? res.data.data.backupCodes.filter((value: unknown): value is string => typeof value === 'string')
        : [];
      if (codes.length !== 8) {
        setError('Two-factor authentication was enabled, but recovery codes were not returned. Sign out and contact a super administrator before relying on this account.');
        return;
      }
      setIssuedBackupCodes(codes);
      setEnrolledUser(user as Record<string, unknown>);
      setEnrolledMustRotate(mustRotatePassword === true);
    } catch (err) {
      setError(getErrorMessage(err));
      setEnrolCode('');
    } finally {
      setLoading(false);
    }
  };

  const copyBackupCodes = async (): Promise<void> => {
    if (backupCodesCopying) return;
    setError('');
    setBackupCodesCopied(false);
    setBackupCodesCopying(true);
    try {
      await navigator.clipboard.writeText(issuedBackupCodes.join('\n'));
      setBackupCodesCopied(true);
    } catch {
      setError('Copy was blocked by this browser. Select the codes and save them manually.');
    } finally {
      setBackupCodesCopying(false);
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

  if (issuedBackupCodes.length > 0 && enrolledUser) {
    return (
      <AdminAuthShell
        title="Save your recovery codes"
        description="These one-time codes are the recovery path if you lose access to your authenticator. They will not be shown again."
        wide
      >
        <section className="rounded-xl border border-[var(--color-border)] bg-white p-6 md:p-8" aria-labelledby="backup-code-heading">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <h2 id="backup-code-heading" className="font-semibold">Store all eight codes securely</h2>
            <p className="mt-1 leading-6">Each code works once. Do not put them in a support ticket, chat, screenshot, or shared document.</p>
          </div>

          <ol className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2" aria-label="One-time administrator recovery codes">
            {issuedBackupCodes.map((code, index) => (
              <li key={code} className="flex min-h-11 items-center rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 font-mono text-sm font-semibold tracking-[0.12em] text-[var(--color-text)]">
                <span className="mr-3 text-xs font-normal text-[var(--color-text-tertiary)]">{index + 1}.</span>
                {code}
              </li>
            ))}
          </ol>

          <button
            type="button"
            onClick={() => void copyBackupCodes()}
            disabled={backupCodesCopying}
            aria-busy={backupCodesCopying}
            aria-describedby={error ? 'recovery-copy-error' : backupCodesCopied ? 'recovery-copy-status' : undefined}
            className="mt-4 min-h-11 w-full rounded-md border border-[var(--color-border-strong)] px-4 text-sm font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary-soft)] disabled:cursor-wait disabled:opacity-60"
          >
            {backupCodesCopying ? 'Copying recovery codes…' : backupCodesCopied ? 'Codes copied' : 'Copy all recovery codes'}
          </button>

          {error && (
            <p id="recovery-copy-error" role="alert" className="mt-3 rounded-md border border-[var(--color-danger)] bg-[var(--color-danger-bg)] p-3 text-sm text-[var(--color-danger)]">
              {error}
            </p>
          )}
          {backupCodesCopied && (
            <p id="recovery-copy-status" role="status" className="mt-3 text-sm text-[var(--color-success)]">
              Recovery codes copied. Save them in your secure location before continuing.
            </p>
          )}

          <label className="mt-5 flex items-start gap-3 rounded-md border border-[var(--color-border)] p-4 text-sm text-[var(--color-text)]">
            <input
              type="checkbox"
              checked={backupCodesSaved}
              onChange={(event) => setBackupCodesSaved(event.target.checked)}
              className="mt-0.5 h-5 w-5"
            />
            <span>I saved these codes in a private password manager or another secure location.</span>
          </label>

          <button
            type="button"
            disabled={!backupCodesSaved}
            onClick={() => {
              const user = enrolledUser;
              const mustRotatePassword = enrolledMustRotate;
              setIssuedBackupCodes([]);
              setEnrolledUser(null);
              completeLogin(user, { mustRotatePassword });
            }}
            className="mt-4 min-h-11 w-full rounded-md bg-[var(--color-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:bg-slate-200 disabled:text-slate-600"
          >
            Continue to the operations console
          </button>
        </section>
      </AdminAuthShell>
    );
  }

  // 2FA force-enrollment step (admin/super_admin without TOTP)
  if (requires2FASetup) {
    return (
      <AdminAuthShell
        title="Secure your admin account"
        description="Set up two-factor authentication before entering the operations console."
        wide
      >
          <form
            onSubmit={(e) => void handle2FAEnrol(e)}
            className="rounded-xl border border-[var(--color-border)] bg-white p-6 md:p-8"
          >
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
            ) : setupLoading ? (
              <p role="status" className="mb-4 flex min-h-11 items-center gap-2 text-sm text-[var(--color-text-secondary)]">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Generating setup key&hellip;
              </p>
            ) : (
              <div className="mb-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
                <p className="text-sm leading-6 text-[var(--color-text-secondary)]">
                  The setup key is not available yet. Retry here, or return to login if the temporary sign-in has expired.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void load2FASetup(preAuthToken)}
                  className="mt-3 w-full"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  Try generating setup again
                </Button>
              </div>
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
                setSetupQrDataUrl('');
                setSetupLoading(false);
                setIssuedBackupCodes([]);
                setEnrolledUser(null);
                setPassword('');
                setError('');
              }}
              className="w-full mt-3 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
            >
              Back to login
            </button>
          </form>
      </AdminAuthShell>
    );
  }

  // D37: emailed second step
  if (requiresEmailCode) {
    const clock = Date.now();
    const expired = emailExpiresAt <= clock;
    const resendWait = Math.max(0, emailResendAt - clock);
    const mmss = (ms: number): string => {
      const total = Math.max(0, Math.ceil(ms / 1000));
      return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
    };
    return (
      <AdminAuthShell
        title="Check your email"
        description={`We sent a 6-digit code to ${emailHint || 'your admin email'}. It works for 5 minutes.`}
      >
          <form
            onSubmit={(e) => void handleEmailCodeVerify(e)}
            className="rounded-xl border border-[var(--color-border)] bg-white p-6 md:p-8"
          >
            {error && (
              <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            )}
            {emailNotice && (
              <div role="status" className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
                {emailNotice}
              </div>
            )}

            <p
              data-testid="admin-email-code-clock"
              className={`mb-4 text-center text-sm ${expired ? 'font-semibold text-red-700' : 'text-[var(--color-text-secondary)]'}`}
            >
              {expired ? 'This code has expired.' : `Code expires in ${mmss(emailExpiresAt - clock)}`}
            </p>

            <div className="mb-5">
              <Label htmlFor="login-email-code" className="block text-sm font-medium text-[var(--color-text)] mb-1.5">
                Code from your email
              </Label>
              <Input
                id="login-email-code"
                ref={emailInputRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                value={emailCode}
                onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
                autoFocus
                autoComplete="one-time-code"
                placeholder="000000"
                className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm text-center tracking-[0.3em] font-mono text-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)] focus:border-transparent"
              />
            </div>

            <button
              type="submit"
              disabled={loading || emailCode.length !== 6 || expired}
              className="w-full py-2.5 bg-[var(--color-primary)] text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:bg-slate-200 disabled:text-slate-600 disabled:cursor-not-allowed transition-opacity"
            >
              {loading ? 'Verifying...' : 'Verify'}
            </button>

            {expired && resendWait > 0 ? (
              <p className="mt-3 min-h-11 flex items-center justify-center text-sm text-[var(--color-text-secondary)]">
                Send a new code in {mmss(resendWait)}
              </p>
            ) : expired ? (
              <button
                type="button"
                onClick={() => void handleEmailCodeResend()}
                disabled={emailSending}
                className="mt-3 min-h-11 w-full rounded-md text-sm font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary-soft)] disabled:opacity-60"
              >
                {emailSending ? 'Sending…' : 'Send a new code'}
              </button>
            ) : resendWait > 0 ? (
              <p className="mt-3 min-h-11 flex items-center justify-center text-sm text-[var(--color-text-secondary)]">
                Resend code in {mmss(resendWait)}
              </p>
            ) : (
              <button
                type="button"
                onClick={() => void handleEmailCodeResend()}
                disabled={emailSending}
                className="mt-3 min-h-11 w-full rounded-md text-sm font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary-soft)] disabled:opacity-60"
              >
                {emailSending ? 'Sending…' : 'Resend code'}
              </button>
            )}

            <p className="mt-3 text-center text-xs text-[var(--color-text-secondary)]">
              Can’t find it? Check your spam or junk folder.
            </p>

            {totpFallbackToken && (
              <button
                type="button"
                onClick={() => {
                  // Switch to the authenticator step with its own pre-auth token.
                  setPreAuthToken(totpFallbackToken);
                  setTotpFallbackToken('');
                  setRequiresEmailCode(false);
                  setEmailCode('');
                  setEmailNotice('');
                  setError('');
                  setRequires2FA(true);
                  setTimeout(() => totpInputRef.current?.focus(), 100);
                }}
                className="mt-3 min-h-11 w-full rounded-md text-sm font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary-soft)]"
              >
                Use authenticator app instead
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setRequiresEmailCode(false);
                setPreAuthToken('');
                setTotpFallbackToken('');
                setEmailCode('');
                setEmailNotice('');
                setPassword('');
                setError('');
              }}
              className="w-full mt-3 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
            >
              Back to login
            </button>
          </form>
      </AdminAuthShell>
    );
  }

  // 2FA verification step
  if (requires2FA) {
    return (
      <AdminAuthShell
        title="Verify it’s you"
        description={usingBackupCode
          ? 'Enter one unused recovery code. Each recovery code works only once.'
          : 'Enter the current six-digit code from your authenticator app.'}
      >
          <form
            onSubmit={(e) => void handle2FAVerify(e)}
            className="rounded-xl border border-[var(--color-border)] bg-white p-6 md:p-8"
          >
            {error && (
              <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="mb-5">
              <Label htmlFor={usingBackupCode ? 'login-backup-code' : 'login-totp'} className="block text-sm font-medium text-[var(--color-text)] mb-1.5">
                {usingBackupCode ? 'One-time recovery code' : 'Verification code'}
              </Label>
              <Input
                id={usingBackupCode ? 'login-backup-code' : 'login-totp'}
                ref={totpInputRef}
                type="text"
                inputMode={usingBackupCode ? 'text' : 'numeric'}
                pattern={usingBackupCode ? '[A-HJ-NP-Z2-9]{10}' : '[0-9]{6}'}
                value={usingBackupCode ? backupCode : totpCode}
                onChange={(e) => {
                  if (usingBackupCode) {
                    setBackupCode(e.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, '').slice(0, 10));
                  } else {
                    setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                  }
                }}
                required
                autoFocus
                autoComplete="one-time-code"
                placeholder={usingBackupCode ? 'ABCD234567' : '000000'}
                className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm text-center tracking-[0.3em] font-mono text-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)] focus:border-transparent"
              />
              <button
                type="button"
                onClick={() => {
                  setUsingBackupCode((current) => !current);
                  setTotpCode('');
                  setBackupCode('');
                  setError('');
                  setTimeout(() => totpInputRef.current?.focus(), 0);
                }}
                className="mt-3 min-h-11 w-full rounded-md text-sm font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary-soft)]"
              >
                {usingBackupCode ? 'Use authenticator code instead' : 'Use a recovery code'}
              </button>
            </div>

            <button
              type="submit"
              disabled={loading || (usingBackupCode ? backupCode.length !== 10 : totpCode.length !== 6)}
              className="w-full py-2.5 bg-[var(--color-primary)] text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:bg-slate-200 disabled:text-slate-600 disabled:cursor-not-allowed transition-opacity"
            >
              {loading ? 'Verifying...' : usingBackupCode ? 'Use recovery code' : 'Verify'}
            </button>

            <button
              type="button"
              onClick={() => {
                setRequires2FA(false);
                setPreAuthToken('');
                setTotpCode('');
                setBackupCode('');
                setUsingBackupCode(false);
                setPassword('');
                setError('');
              }}
              className="w-full mt-3 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
            >
              Back to login
            </button>
          </form>
      </AdminAuthShell>
    );
  }

  return (
    <AdminAuthShell
      title="Welcome back"
      description="Sign in to manage customers, providers, bookings, support, and company operations."
    >
        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="rounded-xl border border-[var(--color-border)] bg-white p-6 md:p-8"
        >
          <h2 className="text-lg font-semibold text-[var(--color-text)] mb-5">Sign in to onService</h2>

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
              className="h-11 w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)] focus:border-transparent"
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
              className="h-11 w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)] focus:border-transparent"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !email || !password}
            className="min-h-11 w-full py-2.5 bg-[var(--color-primary)] text-white text-sm font-medium rounded-lg hover:bg-[var(--color-primary-dark)] disabled:bg-slate-200 disabled:text-slate-600 disabled:cursor-not-allowed transition-colors"
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
    </AdminAuthShell>
  );
}
