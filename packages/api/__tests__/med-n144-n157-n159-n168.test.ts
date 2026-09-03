// MED-N157 / MED-N159 / MED-N168 — webhook + auth gating cluster.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const WEBHOOK_ROUTES = readFileSync(
  resolve(__dirname, '../src/routes/webhook.routes.ts'),
  'utf8',
);
const WALLET_ROUTES = readFileSync(
  resolve(__dirname, '../src/routes/wallet.routes.ts'),
  'utf8',
);
const PAYOUT_ROUTES = readFileSync(
  resolve(__dirname, '../src/routes/payout.routes.ts'),
  'utf8',
);
const PROMOTION_ROUTES = readFileSync(
  resolve(__dirname, '../src/routes/promotion.routes.ts'),
  'utf8',
);

function stripLineComments(src: string): string {
  return src.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
}

describe('MED-N157 — webhook routes via intent_kind metadata, not string prefix', () => {
  it('MED-N157 — webhook routes prefer metadata.intent_kind over topup_ prefix', () => {
    const noComments = stripLineComments(WEBHOOK_ROUTES);
    expect(noComments).toMatch(/intentKind === 'top_up'/);
    expect(noComments).toMatch(/paymentData\?\.metadata\?\.intent_kind/);
  });

  it('MED-N157 — wallet/topup intent creation passes intent_kind="top_up"', () => {
    expect(stripLineComments(WALLET_ROUTES)).toMatch(/'top_up'/);
  });
});

describe('MED-N159 — payout endpoints require super_admin', () => {
  it('MED-N159 — payout.routes defines requireSuperAdmin helper', () => {
    expect(stripLineComments(PAYOUT_ROUTES)).toMatch(/function requireSuperAdmin/);
  });

  it('MED-N159 — /:id/approve, /:id/reject, /:id/complete each call requireSuperAdmin', () => {
    function blockBetween(src: string, startLiteral: string, endLiteral: string): string {
      const start = src.indexOf(startLiteral);
      if (start < 0) return '';
      const end = src.indexOf(endLiteral, start + startLiteral.length);
      return end < 0 ? src.slice(start) : src.slice(start, end);
    }
    const approveBlock = blockBetween(PAYOUT_ROUTES, "'/:id/approve'", 'router.put');
    const rejectBlock = blockBetween(PAYOUT_ROUTES, "'/:id/reject'", 'router.put');
    const completeBlock = blockBetween(PAYOUT_ROUTES, "'/:id/complete'", 'export default');
    expect(approveBlock).not.toBe('');
    expect(rejectBlock).not.toBe('');
    expect(completeBlock).not.toBe('');
    expect(approveBlock).toMatch(/requireSuperAdmin/);
    expect(rejectBlock).toMatch(/requireSuperAdmin/);
    expect(completeBlock).toMatch(/requireSuperAdmin/);
  });
});

describe('MED-N168 — promotion DELETE raised to super_admin', () => {
  it('MED-N168 — DELETE /promotions/:id uses rbacMiddleware super_admin only', () => {
    // Find the delete handler text from `router.delete(` to `export default`.
    const start = PROMOTION_ROUTES.indexOf('router.delete(');
    expect(start).toBeGreaterThan(0);
    const end = PROMOTION_ROUTES.indexOf('export default', start);
    const deleteBlock = PROMOTION_ROUTES.slice(start, end);
    expect(deleteBlock).toMatch(/rbacMiddleware\('super_admin'\)/);
    expect(deleteBlock).not.toMatch(/rbacMiddleware\('admin', 'super_admin'\)/);
  });
});
