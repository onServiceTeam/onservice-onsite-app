// apps/mobile/src/utils/cancellation-policy.ts
//
// Bug 1170 / 1198 fix verified.
// Phase 14 Dispatch 02 — mobile fetches the cancellation policy from the
// public server endpoint instead of hardcoding tier values.
// Render-side helpers used by terms.tsx and help.tsx so both surfaces show
// the SAME text (the four-place drift Bug 1170 was filed for is now
// structurally impossible).

import api from '@/services/api';

export interface CancellationPolicyTier {
  min_hours_before: number;
  max_hours_before: number | null;
  refund_percent: number;
  fee_percent: number;
  label: string;
}

export interface CancellationPolicy {
  version: number;
  effective_from: string;
  tiers: CancellationPolicyTier[];
  intro_text: string;
  legal_disclaimer: string;
  provider_no_show_credit_php: number;
}

interface PolicyResponse {
  success: true;
  data: CancellationPolicy;
}

export async function fetchCancellationPolicy(): Promise<CancellationPolicy> {
  const res = await api.get<PolicyResponse>('/api/v1/settings/cancellation-policy');
  return res.data.data;
}

/**
 * Build the human-readable terms-screen body — intro, tier-by-tier breakdown,
 * provider no-show line, legal disclaimer. The terms screen renders the
 * returned string verbatim so any wording change happens by editing the
 * policy in the admin UI, not by editing this function.
 */
export function policyToTermsText(policy: CancellationPolicy): string {
  const lines: string[] = [policy.intro_text, ''];
  for (const tier of policy.tiers) {
    lines.push(`• ${tier.label}: ${tier.refund_percent}% refund (${tier.fee_percent}% fee).`);
  }
  lines.push('');
  lines.push(
    `If the provider fails to arrive: full refund plus a ₱${policy.provider_no_show_credit_php} platform-funded apology credit.`,
  );
  lines.push('');
  lines.push(policy.legal_disclaimer);
  return lines.join('\n');
}

/**
 * Build the help-screen "Can I cancel a booking?" FAQ answer. Shorter
 * format — one sentence per tier, no legal disclaimer. The disclaimer is
 * shown on terms.tsx only.
 */
export function policyToHelpAnswer(policy: CancellationPolicy): string {
  const sentences: string[] = [policy.intro_text];
  for (const tier of policy.tiers) {
    sentences.push(`${tier.label}: ${tier.refund_percent}% refund.`);
  }
  return sentences.join(' ');
}
