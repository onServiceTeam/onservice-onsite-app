// BUG-PHASE96-01 — data export 'expired' status visually distinct +
// labelled in both customer and provider account-management screens.
//
// Pre-fix the StatusIcon / statusColor ternaries only branched on
// 'completed' and 'failed'; everything else fell through to the
// Hourglass icon + colors.textSecondary. status='expired' (set when
// a completed export passes its 30-day retention window via the
// data-management.service.ts cron) rendered the SAME visual as
// 'pending' / 'processing' — a user returning later saw what looked
// like "still being prepared" with no download link, no error, no
// explanation that the file was already gone.
//
// Fix: branch out 'expired' explicitly. XCircle in textTertiary so
// it's visually distinct from green-check completed and red-X failed.
// Inline "Expired — request again" hint so the user understands the
// file is gone and they need to request a new export.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const CUSTOMER = readFileSync(
  resolve(__dirname, '../app/customer/account-management.tsx'),
  'utf8',
);
const PROVIDER = readFileSync(
  resolve(__dirname, '../app/provider/account-management.tsx'),
  'utf8',
);

describe('BUG-PHASE96-01 — data export "expired" status branched explicitly', () => {
  it('BUG-PHASE96-01 — customer screen StatusIcon branches on expired', () => {
    expect(CUSTOMER).toMatch(/exp\.status === 'expired' \? XCircle/);
  });

  it('BUG-PHASE96-01 — customer screen statusColor branches on expired', () => {
    expect(CUSTOMER).toMatch(/exp\.status === 'expired' \? colors\.textTertiary/);
  });

  it('BUG-PHASE96-01 — customer screen renders "Expired — request again" hint', () => {
    expect(CUSTOMER).toMatch(/Expired — request again/);
    expect(CUSTOMER).toMatch(/exp\.status === 'expired' && \(/);
  });

  it('BUG-PHASE96-01 — provider screen StatusIcon branches on expired', () => {
    expect(PROVIDER).toMatch(/exp\.status === 'expired' \? XCircle/);
  });

  it('BUG-PHASE96-01 — provider screen statusColor branches on expired', () => {
    expect(PROVIDER).toMatch(/exp\.status === 'expired' \? colors\.textTertiary/);
  });

  it('BUG-PHASE96-01 — provider screen renders "Expired — request again" hint', () => {
    expect(PROVIDER).toMatch(/Expired — request again/);
    expect(PROVIDER).toMatch(/exp\.status === 'expired' && \(/);
  });
});
