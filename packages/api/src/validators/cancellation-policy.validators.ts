// packages/api/src/validators/cancellation-policy.validators.ts
//
// Bug 1170 / 1198 fix verified.
// Phase 14 Dispatch 02 — admin editor server-side validation.
//
// Same rule set the admin UI enforces client-side. Duplicated here because
// the server is canonical: any client (current admin UI, future automation,
// curl) gets rejected if its policy doesn't satisfy these invariants.

import { z } from 'zod';

const tierSchema = z.object({
  min_hours_before: z.number().finite(),
  max_hours_before: z.number().finite().nullable(),
  refund_percent: z.number().int().min(0).max(100),
  fee_percent: z.number().int().min(0).max(100),
  label: z.string().min(1).max(120),
});

export type CancellationPolicyTierInput = z.infer<typeof tierSchema>;

/**
 * Cross-row validation:
 *   1. At least one tier.
 *   2. Each row: refund_percent + fee_percent === 100.
 *   3. min_hours_before strictly descending across rows (top of table is the
 *      most-lead-time tier; bottom is post-scheduled / no-show).
 *   4. Top tier may have max_hours_before === null; every other tier must
 *      have a finite max_hours_before.
 *   5. Contiguous coverage: row[i].min_hours_before === row[i+1].max_hours_before.
 *      No gaps, no overlaps.
 *   6. The bottom tier's min_hours_before should be a sentinel <= 0 so that
 *      hoursBefore values for in-progress / no-show land in it.
 */
function validateTiersCrossRow(
  tiers: CancellationPolicyTierInput[],
): { ok: true } | { ok: false; error: string } {
  if (tiers.length === 0) return { ok: false, error: 'At least one tier is required.' };

  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i]!;
    if (t.refund_percent + t.fee_percent !== 100) {
      return { ok: false, error: `Tier ${i + 1} (${t.label}): refund_percent + fee_percent must equal 100, got ${t.refund_percent + t.fee_percent}.` };
    }
  }

  if (tiers[0]!.max_hours_before !== null) {
    return { ok: false, error: 'Top tier (first row) must have max_hours_before = null (open-ended high end).' };
  }

  for (let i = 1; i < tiers.length; i++) {
    if (tiers[i]!.max_hours_before === null) {
      return { ok: false, error: `Tier ${i + 1} (${tiers[i]!.label}): only the top tier may have max_hours_before = null.` };
    }
  }

  for (let i = 0; i < tiers.length - 1; i++) {
    const a = tiers[i]!;
    const b = tiers[i + 1]!;
    if (a.min_hours_before <= b.min_hours_before) {
      return { ok: false, error: `Tier ${i + 2} (${b.label}): min_hours_before must be strictly less than the row above (${a.label}).` };
    }
    if (a.min_hours_before !== b.max_hours_before) {
      return {
        ok: false,
        error: `Tier ${i + 1}/${i + 2} boundary (${a.label} → ${b.label}): row ${i + 1} min_hours_before (${a.min_hours_before}) must equal row ${i + 2} max_hours_before (${b.max_hours_before}). No gaps or overlaps.`,
      };
    }
  }

  const bottom = tiers[tiers.length - 1]!;
  if (bottom.min_hours_before > 0) {
    return { ok: false, error: 'Bottom tier should cover post-scheduled events; its min_hours_before must be <= 0.' };
  }

  return { ok: true };
}

export const createCancellationPolicySchema = z.object({
  tiers: z.array(tierSchema).superRefine((tiers, ctx) => {
    const result = validateTiersCrossRow(tiers);
    if (!result.ok) {
      ctx.addIssue({ code: 'custom', message: result.error });
    }
  }),
  intro_text: z.string().min(10).max(1000),
  legal_disclaimer: z.string().min(10).max(2000),
  provider_no_show_credit_php: z.number().int().min(0).max(10000),
});

export type CreateCancellationPolicyInput = z.infer<typeof createCancellationPolicySchema>;

// PUT (in-place edit, 1-hour window) accepts the same shape as POST.
export const updateCancellationPolicySchema = createCancellationPolicySchema;
