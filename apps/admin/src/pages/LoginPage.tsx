import React, { useState, useRef, type FormEvent } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuthStore, type AdminUser } from '@/stores/auth.store';
import api, { getErrorMessage } from '@/lib/api';

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

      const { accessToken, refreshToken, user } = data;
      completeLogin(user, accessToken, refreshToken);
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
      const { accessToken, refreshToken, user } = res.data.data;
      completeLogin(user, accessToken, refreshToken);
    } catch (err) {
      setError(getErrorMessage(err));
      setTotpCode('');
    } finally {
      setLoading(false);
    }
  };

  const completeLogin = (user: Record<string, unknown>, accessToken: string, refreshToken: string): void => {
    const role = user.role as string;
    if (role !== 'admin' && role !== 'super_admin') {
      setError('Access denied. Admin privileges required.');
      return;
    }

    const adminUser: AdminUser = {
      id: user.id as string,
      email: user.email as string,
      phone: user.phone as string,
      firstName: user.firstName as string,
      lastName: user.lastName as string,
      role,
      avatarUrl: user.avatarUrl as string | null,
    };

    login(adminUser, accessToken, refreshToken);
    navigate('/');
  };

  // 2FA verification step
  if (requires2FA) {
    return (
      <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-[var(--color-text)]">
              <span className="text-[var(--color-secondary)]">on</span>Service
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
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="mb-5">
              <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Verification Code</label>
              <input
                ref={totpInputRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
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
              className="w-full py-2.5 bg-[var(--color-primary)] text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
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
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-[var(--color-text)]">
            <span className="text-[var(--color-secondary)]">on</span>Service
          </h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">Admin Panel</p>
        </div>

        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="bg-white rounded-xl border border-[var(--color-border)] p-6 shadow-sm"
        >
          <h2 className="text-lg font-semibold text-[var(--color-text)] mb-5">Sign In</h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="mb-4">
            <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Email</label>
            <input
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
            <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Password</label>
            <input
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
            className="w-full py-2.5 bg-[var(--color-primary)] text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-xs text-[var(--color-text-secondary)] mt-4">
          Authorized personnel only
        </p>
      </div>
    </div>
  );
}
