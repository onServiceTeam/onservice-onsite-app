import { createAppError } from '../middleware/error.middleware';

export const BIR_DOCUMENT_HOLD_MESSAGE =
  'BIR document generation is disabled pending accountant approval of the invoice type, tax basis, and authorized numbering (E22).';

/**
 * Prevents deployed environments from creating or changing documents that
 * could be mistaken for accountant-approved BIR records. Tests bypass the
 * deployment hold so the underlying calculations remain regression-tested.
 */
export function assertBirDocumentWritesEnabled(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.NODE_ENV === 'test') return;

  // E22 is a legal/compliance hard stop, not an environment-toggle decision.
  // Keep BIR_DOCUMENT_ISSUANCE_ENABLED=0 in deployment templates as an
  // operator-visible reminder, but do not let a mistyped value authorize
  // document issuance. Closing E22 requires an explicit reviewed code change.
  throw createAppError(BIR_DOCUMENT_HOLD_MESSAGE, 503);
}
