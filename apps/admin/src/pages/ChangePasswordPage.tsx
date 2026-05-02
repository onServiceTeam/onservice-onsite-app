/**
 * LAUNCH-LIMITATIONS #12 fix — admin self-service password rotation.
 *
 * Reachable two ways:
 *   1. The route guard (App.tsx) redirects here automatically when
 *      `useAuthStore().mustRotatePassword === true`. Used to gate
 *      legacy-hash admins after the operator runs the bulk-flag
 *      campaign.
 *   2. Voluntary visit via Settings → Security → Change password.
 *
 * Validates client-side that the new password is 12-128 chars and
 * differs from the old one before hitting the server. The server
 * does the same checks plus verifies the old password against the
 * stored scrypt hash. On success the page calls clearMustRotate()
 * and routes back to the dashboard.
 */

import React, { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth.store';
import api, { getErrorMessage } from '@/lib/api';

const MIN_LEN = 12;
const MAX_LEN = 128;

export default function ChangePasswordPage(): React.ReactElement {
  const navigate = useNavigate();
  const { mustRotatePassword, clearMustRotate } = useAuthStore();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Client-side validity is the SAME predicate the server enforces
  // so we can disable the submit button until the user actually
  // could succeed. Any message here is purely UI hint; the server is
  // the source of truth.
  const newLen = newPassword.length;
  const newTooShort = newLen > 0 && newLen < MIN_LEN;
  const newTooLong = newLen > MAX_LEN;
  const newSameAsOld = newPassword.length > 0 && newPassword === oldPassword;
  const confirmMismatch =
    confirmPassword.length > 0 && newPassword !== confirmPassword;
  const formValid =
    oldPassword.length > 0
    && newLen >= MIN_LEN
    && newLen <= MAX_LEN
    && !newSameAsOld
    && !confirmMismatch;

  const onSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!formValid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post('/api/v1/security/admin/me/change-password', {
        oldPassword,
        newPassword,
      });
      clearMustRotate();
      setDone(true);
      // Quick handoff to dashboard — done state is shown briefly so
      // the user gets confirmation rather than an unexplained route
      // change.
      setTimeout(() => navigate('/'), 800);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto py-8">
      {mustRotatePassword && (
        <div
          className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
          role="status"
          aria-live="polite"
        >
          <p className="font-semibold">Password rotation required</p>
          <p className="mt-1">
            Your account is flagged for a password rotation campaign. Set a new
            password to continue. You will not be able to access other admin
            screens until this is done.
          </p>
        </div>
      )}

      <h1 className="text-2xl font-semibold text-[var(--color-text)] mb-1">
        Change password
      </h1>
      <p className="text-sm text-[var(--color-text-secondary)] mb-6">
        Enter your current password and a new one. The new password must be
        between {MIN_LEN} and {MAX_LEN} characters.
      </p>

      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
        <div>
          <label
            htmlFor="cp-old"
            className="block text-sm font-medium text-[var(--color-text)] mb-1"
          >
            Current password
          </label>
          <input
            id="cp-old"
            type={showPasswords ? 'text' : 'password'}
            autoComplete="current-password"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            disabled={submitting || done}
            required
            className="w-full px-3 py-2 border border-[var(--color-border)] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
          />
        </div>

        <div>
          <label
            htmlFor="cp-new"
            className="block text-sm font-medium text-[var(--color-text)] mb-1"
          >
            New password
          </label>
          <input
            id="cp-new"
            type={showPasswords ? 'text' : 'password'}
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            disabled={submitting || done}
            required
            minLength={MIN_LEN}
            maxLength={MAX_LEN}
            aria-describedby="cp-new-help"
            className="w-full px-3 py-2 border border-[var(--color-border)] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
          />
          <p id="cp-new-help" className="text-xs mt-1">
            {newTooShort && (
              <span className="text-red-600">
                Too short — must be at least {MIN_LEN} characters.
              </span>
            )}
            {newTooLong && (
              <span className="text-red-600">
                Too long — must be at most {MAX_LEN} characters.
              </span>
            )}
            {newSameAsOld && (
              <span className="text-red-600">
                Must differ from the current password.
              </span>
            )}
            {!newTooShort && !newTooLong && !newSameAsOld && (
              <span className="text-[var(--color-text-secondary)]">
                {newLen}/{MAX_LEN} characters
              </span>
            )}
          </p>
        </div>

        <div>
          <label
            htmlFor="cp-confirm"
            className="block text-sm font-medium text-[var(--color-text)] mb-1"
          >
            Confirm new password
          </label>
          <input
            id="cp-confirm"
            type={showPasswords ? 'text' : 'password'}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={submitting || done}
            required
            className="w-full px-3 py-2 border border-[var(--color-border)] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
          />
          {confirmMismatch && (
            <p className="text-xs mt-1 text-red-600">Passwords don't match.</p>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
          <input
            type="checkbox"
            checked={showPasswords}
            onChange={(e) => setShowPasswords(e.target.checked)}
            disabled={submitting || done}
          />
          Show passwords
        </label>

        {error && (
          <div
            className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            role="alert"
          >
            {error}
          </div>
        )}

        {done && (
          <div
            className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700"
            role="status"
            aria-live="polite"
          >
            Password updated. Redirecting…
          </div>
        )}

        <button
          type="submit"
          disabled={!formValid || submitting || done}
          className="w-full inline-flex items-center justify-center px-4 py-2 rounded-md bg-[var(--color-primary)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Updating…' : done ? 'Done' : 'Update password'}
        </button>
      </form>
    </div>
  );
}
