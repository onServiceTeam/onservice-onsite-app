// apps/admin/src/lib/cancellation-policy-validation.ts
//
// Bug 1170-admin-ui fix verified.
// Phase 14 Dispatch 02 — admin editor client-side validation.
//
// Mirrors `packages/api/src/validators/cancellation-policy.validators.ts`
// so the admin UI surfaces row-level errors before the user clicks Save.
// Server is canonical; this module is for UX, not safety.

export interface Tier {
  min_hours_before: number;
  max_hours_before: number | null;
  refund_percent: number;
  fee_percent: number;
  label: string;
}

export interface ValidationOutcome {
  ok: boolean;
  errors: Record<number, string>;
  summary: string | null;
}

export function validateTiers(tiers: Tier[]): ValidationOutcome {
  const errors: Record<number, string> = {};
  if (tiers.length === 0) {
    return { ok: false, errors, summary: 'At least one tier is required.' };
  }

  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i]!;
    if (t.refund_percent + t.fee_percent !== 100) {
      errors[i] =
        `Refund ${t.refund_percent}% + fee ${t.fee_percent}% = ${t.refund_percent + t.fee_percent}% (must equal 100).`;
    }
  }

  if (tiers[0]!.max_hours_before !== null) {
    errors[0] = (errors[0] ? errors[0] + ' ' : '') + 'Top tier max_hours_before must be empty (open-ended).';
  }
  for (let i = 1; i < tiers.length; i++) {
    if (tiers[i]!.max_hours_before === null) {
      errors[i] = (errors[i] ? errors[i] + ' ' : '') + 'Only the top tier may have an empty max.';
    }
  }
  for (let i = 0; i < tiers.length - 1; i++) {
    const a = tiers[i]!;
    const b = tiers[i + 1]!;
    if (a.min_hours_before <= b.min_hours_before) {
      errors[i + 1] = (errors[i + 1] ? errors[i + 1] + ' ' : '') + 'min_hours_before must be strictly less than the row above.';
    }
    if (a.min_hours_before !== b.max_hours_before) {
      errors[i + 1] = (errors[i + 1] ? errors[i + 1] + ' ' : '')
        + `Boundary mismatch: row ${i + 1} min (${a.min_hours_before}) must equal row ${i + 2} max (${b.max_hours_before}).`;
    }
  }

  const bottom = tiers[tiers.length - 1]!;
  if (bottom.min_hours_before > 0) {
    errors[tiers.length - 1] = (errors[tiers.length - 1] ? errors[tiers.length - 1] + ' ' : '')
      + 'Bottom tier should cover post-scheduled events (min_hours_before <= 0).';
  }

  const ok = Object.keys(errors).length === 0;
  return { ok, errors, summary: ok ? null : 'Fix the highlighted rows before saving.' };
}

export function findTier(hoursBefore: number, tiers: Tier[]): Tier | null {
  for (const t of tiers) {
    const aboveFloor = hoursBefore >= t.min_hours_before;
    const belowCeiling = t.max_hours_before === null ? true : hoursBefore < t.max_hours_before;
    if (aboveFloor && belowCeiling) return t;
  }
  return null;
}

export function previewOutcome(
  hoursBefore: number,
  sampleAmountCentavos: number,
  tiers: Tier[],
): { tier: Tier | null; refund_centavos: number; fee_centavos: number } {
  const tier = findTier(hoursBefore, tiers);
  if (!tier) return { tier: null, refund_centavos: 0, fee_centavos: sampleAmountCentavos };
  const refund = Math.floor((sampleAmountCentavos * tier.refund_percent) / 100);
  return { tier, refund_centavos: refund, fee_centavos: sampleAmountCentavos - refund };
}
