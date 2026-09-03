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
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from '@/components/ui';
import { CheckCircle2, Key, Lock, RefreshCw, Shield } from '@/components/icons';

const MIN_LEN = 12;
const MAX_LEN = 128;

function passwordChangeErrorMessage(error: unknown): string {
  const message = getErrorMessage(error);
  if (/failed to fetch|network error|network request failed/i.test(message)) {
    return "We couldn't reach onService. Check your connection and try again.";
  }
  if (/^http 5\d\d$|internal server error|unexpected error/i.test(message)) {
    return "We couldn't update your password right now. Try again. If it keeps failing, contact a super administrator.";
  }
  return message;
}

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
  const [newTouched, setNewTouched] = useState(false);
  const [confirmTouched, setConfirmTouched] = useState(false);

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
    && confirmPassword.length > 0
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
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setDone(true);
    } catch (err) {
      setError(passwordChangeErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 py-2">
      <header className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
          <Key className="h-6 w-6" aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm font-medium text-[var(--color-text-secondary)]">Account security</p>
          <h1 className="mt-1 text-2xl font-bold text-[var(--color-text)]">
            Change password
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--color-text-secondary)]">
            Replace the password used to enter the operations console. The
            change takes effect immediately and is recorded in the Admin audit
            trail.
          </p>
        </div>
      </header>

      {mustRotatePassword && (
        <div
          className="flex items-start gap-3 rounded-lg border border-[var(--color-warning)] bg-[var(--color-warning-bg)] p-4 text-sm text-[var(--color-text)]"
          role="status"
          aria-live="polite"
        >
          <Lock className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-warning)]" aria-hidden="true" />
          <div>
            <p className="font-semibold">Password rotation required</p>
            <p className="mt-1 leading-5">
              Set a new password before continuing. The API also blocks all
              customer, provider, booking, support, money, and configuration
              actions until this rotation succeeds.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
        {done ? (
          <Card className="border-[var(--color-success)]" role="status" aria-live="polite">
            <CardContent className="flex min-h-80 flex-col items-start justify-center p-6 sm:p-8">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--color-success-bg)] text-[var(--color-success)]">
                <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
              </div>
              <h2 className="mt-6 text-xl font-semibold text-[var(--color-text)]">Password updated</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--color-text-secondary)]">
                This browser now has a replacement session. Other signed-in
                browsers and active realtime connections for your account have
                been ended.
              </p>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--color-text-secondary)]">
                Existing bookings, support cases, assignments, permissions,
                transactions, and audit history were not changed.
              </p>
              <Button type="button" className="mt-6" onClick={() => navigate('/')}>
                Continue to operations
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Set a new password</CardTitle>
              <CardDescription>
                Use {MIN_LEN} to {MAX_LEN} characters. Passwords are case-sensitive,
                and the new password must differ from the current one.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form noValidate onSubmit={(e) => void onSubmit(e)} className="space-y-4" aria-busy={submitting}>
                <div className="space-y-2">
                  <Label htmlFor="cp-old">
                    Current password <span aria-hidden="true" className="text-[var(--color-danger)]">*</span>
                  </Label>
                  <Input
                    id="cp-old"
                    type={showPasswords ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={oldPassword}
                    onChange={(event) => {
                      setOldPassword(event.target.value);
                      setError(null);
                    }}
                    disabled={submitting}
                    aria-required="true"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cp-new">
                    New password <span aria-hidden="true" className="text-[var(--color-danger)]">*</span>
                  </Label>
                  <Input
                    id="cp-new"
                    type={showPasswords ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(event) => {
                      setNewPassword(event.target.value);
                      setError(null);
                    }}
                    onBlur={() => setNewTouched(true)}
                    disabled={submitting}
                    maxLength={MAX_LEN}
                    aria-required="true"
                    aria-invalid={newTouched && (newTooShort || newTooLong || newSameAsOld)}
                    aria-describedby="cp-new-help"
                  />
                  <p id="cp-new-help" className="min-h-4 text-xs text-[var(--color-text-secondary)]">
                    {newTouched && newTooShort && (
                      <span className="text-[var(--color-danger)]" role="alert">
                        Too short. Use at least {MIN_LEN} characters.
                      </span>
                    )}
                    {newTouched && newTooLong && (
                      <span className="text-[var(--color-danger)]" role="alert">
                        Too long. Use at most {MAX_LEN} characters.
                      </span>
                    )}
                    {newTouched && newSameAsOld && (
                      <span className="text-[var(--color-danger)]" role="alert">
                        The new password must differ from the current password.
                      </span>
                    )}
                    {(!newTouched || (!newTooShort && !newTooLong && !newSameAsOld)) && (
                      <span>{newLen}/{MAX_LEN} characters</span>
                    )}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cp-confirm">
                    Confirm new password <span aria-hidden="true" className="text-[var(--color-danger)]">*</span>
                  </Label>
                  <Input
                    id="cp-confirm"
                    type={showPasswords ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => {
                      setConfirmPassword(event.target.value);
                      setError(null);
                    }}
                    onBlur={() => setConfirmTouched(true)}
                    disabled={submitting}
                    aria-required="true"
                    aria-invalid={confirmTouched && confirmMismatch}
                    aria-describedby={confirmTouched && confirmMismatch ? 'cp-confirm-error' : undefined}
                  />
                  {confirmTouched && confirmMismatch && (
                    <p id="cp-confirm-error" className="text-xs text-[var(--color-danger)]" role="alert">
                      Passwords do not match.
                    </p>
                  )}
                </div>

                <Label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-[var(--color-border)] px-3 text-[var(--color-text-secondary)]">
                  <input
                    type="checkbox"
                    checked={showPasswords}
                    onChange={(event) => setShowPasswords(event.target.checked)}
                    disabled={submitting}
                    aria-label="Show passwords"
                    className="h-4 w-4 shrink-0 rounded border border-[var(--color-border-strong)] accent-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-secondary)]"
                  />
                  <span>Show passwords</span>
                </Label>

                {error && (
                  <div
                    className="rounded-md border border-[var(--color-danger)] bg-[var(--color-danger-bg)] p-3 text-sm text-[var(--color-danger)]"
                    role="alert"
                  >
                    <span className="font-semibold">Password was not updated. </span>
                    {error}
                  </div>
                )}

                <div className="flex flex-col-reverse gap-3 border-t border-[var(--color-border)] pt-4 sm:flex-row sm:justify-end">
                  {!mustRotatePassword && (
                    <Button type="button" variant="outline" onClick={() => navigate('/')} disabled={submitting}>
                      Cancel and return
                    </Button>
                  )}
                  <Button type="submit" disabled={!formValid || submitting}>
                    {submitting && <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />}
                    {submitting ? 'Updating password...' : 'Update password'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <aside className="space-y-4" aria-label="Password change impact">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Shield className="h-5 w-5 text-[var(--color-primary)]" aria-hidden="true" />
                <CardTitle>What this secures</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 text-sm leading-5 text-[var(--color-text-secondary)]">
                <li>This browser stays signed in with a replacement session.</li>
                <li>Every other browser session for this account is revoked.</li>
                <li>Open support and messaging connections are disconnected.</li>
                <li>The password-rotation requirement clears only after the server commits the change.</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Before you continue</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-6 text-[var(--color-text-secondary)]">
                Use a unique password stored in a private password manager. Do
                not put passwords or recovery codes in support tickets, chats,
                screenshots, or shared documents.
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
