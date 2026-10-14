/**
 * D38 Milestone 3: "Call provider" for the back office (Waiting now, the
 * Providers tab and Booking 360 "Who was notified").
 *
 * D25 rule: an admin sees a provider's phone masked. Pressing "Call provider"
 * asks the existing POST /api/v1/admin/providers/:id/reveal-contact, which
 * writes a pii_reveal audit row (provider-admin.service revealProviderContact),
 * and then offers a tel: link. The full number lives only in this button's
 * state; it is never written into a shared query cache. A super_admin already
 * receives the raw number, so the tel: link shows straight away and nothing
 * is logged, as on Provider 360.
 */
import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import api, { getErrorMessage } from '@/lib/api';
import { Phone } from '@/components/icons';
import { telHref } from './marketplace-api';

interface ProviderCallButtonProps {
  providerId: string;
  providerName: string;
  /** Masked for every role except super_admin. */
  phone: string | null;
  contactMasked: boolean;
}

export function ProviderCallButton({ providerId, providerName, phone, contactMasked }: ProviderCallButtonProps): React.ReactElement {
  const [revealedPhone, setRevealedPhone] = useState<string | null>(null);
  const reveal = useMutation({
    mutationFn: async () => {
      const response = await api.post<{ success: boolean; data: { phone: string | null } }>(
        `/api/v1/admin/providers/${encodeURIComponent(providerId)}/reveal-contact`,
        {},
      );
      return response.data?.data?.phone ?? null;
    },
    onSuccess: (fullPhone) => setRevealedPhone(fullPhone),
  });

  const callable = contactMasked ? revealedPhone : phone;

  if (callable) {
    return (
      <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <a
          href={telHref(callable)}
          className="inline-flex min-h-11 items-center gap-1 font-semibold text-[var(--color-secondary)] hover:underline"
          aria-label={`Call ${providerName} on ${callable}`}
        >
          <Phone size={14} aria-hidden="true" /> {callable}
        </a>
        {contactMasked ? (
          <span className="text-xs text-[var(--color-text-tertiary)]">Shown to you only. This was logged.</span>
        ) : null}
      </span>
    );
  }

  if (contactMasked && phone) {
    return (
      <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="text-[var(--color-text-secondary)]">{phone}</span>
        <button
          type="button"
          onClick={() => reveal.mutate()}
          disabled={reveal.isPending}
          className="inline-flex min-h-11 items-center gap-1 rounded-md border border-[var(--color-border)] px-3 text-xs font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] disabled:opacity-50"
          aria-label={`Call provider ${providerName}`}
        >
          <Phone size={13} aria-hidden="true" /> {reveal.isPending ? 'Getting number' : 'Call provider'}
        </button>
        {reveal.isError ? (
          <span role="alert" className="text-xs text-[var(--color-danger)]">
            The number could not be shown: {getErrorMessage(reveal.error)}
          </span>
        ) : null}
      </span>
    );
  }

  return <span className="text-xs text-[var(--color-text-tertiary)]">No phone on file</span>;
}
