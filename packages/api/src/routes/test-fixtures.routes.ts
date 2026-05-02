/**
 * Test fixture endpoints for the local Docker stack.
 *
 * D-J27 / F#3 fix.
 *
 * These endpoints exist solely to drive the Maestro visual baseline
 * captures into specific UI states (loading / empty / error / success).
 * They are gated by NODE_ENV !== 'production' AND only mounted when
 * the env var ENABLE_TEST_FIXTURES=1 is set, so they CANNOT
 * accidentally be exposed in production even if NODE_ENV is misset.
 *
 * Endpoints:
 *   POST /__test/force-next-error
 *     Forces the NEXT API request from this client to return 500.
 *     Used by Maestro flows to capture each screen's error state.
 *   POST /__test/seed/empty
 *     body: {scope: 'bookings' | 'wallet' | 'notifications' | ...}
 *     Truncates the named tables so the next read returns nothing,
 *     letting Maestro capture the empty state.
 *   POST /__test/seed/success
 *     body: {scope: 'bookings' | 'wallet' | 'notifications' | ...}
 *     Repopulates the named tables with deterministic happy-path
 *     fixtures so Maestro can capture the success state.
 *   POST /__test/reset
 *     Clears any "force next error" flag and resets fixture caches.
 *
 * Security: this router is constructed WITH the gating check; if
 * either condition fails, an empty no-op router is returned so that
 * a deployment misconfiguration cannot expose these endpoints.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../models/db';
import { logger } from '../utils/logger';

// In-memory single-shot error flag. Set by /force-next-error, cleared
// by the next request that reads it (or by /reset).
let forceNextErrorFlag = false;

export function isFixturesEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.ENABLE_TEST_FIXTURES === '1';
}

/**
 * Middleware that consumes the "force next error" flag. Mount BEFORE
 * the real /api/v1 routes so it can short-circuit the next request.
 */
export function consumeForceNextErrorMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!isFixturesEnabled()) {
    next();
    return;
  }
  // Don't trigger on the fixture endpoints themselves.
  if (req.path.startsWith('/__test')) {
    next();
    return;
  }
  if (forceNextErrorFlag) {
    forceNextErrorFlag = false; // single-shot
    res.status(500).json({
      success: false,
      error: { message: 'Forced error (test fixture).', statusCode: 500 },
    });
    return;
  }
  next();
}

export function buildTestFixturesRouter(): Router {
  const router = Router();
  if (!isFixturesEnabled()) {
    // Return an empty router so even if mounted in error, no real
    // endpoints respond.
    return router;
  }

  router.post('/force-next-error', (_req, res) => {
    forceNextErrorFlag = true;
    logger.info('Test fixture: next API request will return 500');
    res.json({ success: true, data: { armed: true } });
  });

  router.post('/reset', (_req, res) => {
    forceNextErrorFlag = false;
    logger.info('Test fixture: reset cleared the force-next-error flag');
    res.json({ success: true, data: { reset: true } });
  });

  router.post('/seed/empty', async (req, res, next) => {
    try {
      const scope = (req.body as { scope?: string } | undefined)?.scope;
      if (!scope || typeof scope !== 'string') {
        res.status(400).json({
          success: false,
          error: { message: 'scope is required (string).', statusCode: 400 },
        });
        return;
      }
      await truncateScope(scope);
      res.json({ success: true, data: { scope, action: 'empty' } });
    } catch (err) {
      next(err);
    }
  });

  router.post('/seed/success', async (req, res, next) => {
    try {
      const scope = (req.body as { scope?: string } | undefined)?.scope;
      if (!scope || typeof scope !== 'string') {
        res.status(400).json({
          success: false,
          error: { message: 'scope is required (string).', statusCode: 400 },
        });
        return;
      }
      await seedSuccess(scope);
      res.json({ success: true, data: { scope, action: 'success' } });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

// ──────────────────────────────────────────────────────────────────
// Scope handlers — minimal whitelist to avoid arbitrary truncation.
// ──────────────────────────────────────────────────────────────────

const TRUNCATABLE_SCOPES: Record<string, string[]> = {
  bookings: ['bookings'],
  notifications: ['notifications'],
  wallet: ['wallet_transactions'],
  messages: ['conversation_messages'],
};

async function truncateScope(scope: string): Promise<void> {
  const tables = TRUNCATABLE_SCOPES[scope];
  if (!tables) {
    throw new Error(`Unknown empty-scope "${scope}". Allowed: ${Object.keys(TRUNCATABLE_SCOPES).join(', ')}.`);
  }
  await db.transaction(async (client) => {
    for (const table of tables) {
      await client.query(`DELETE FROM ${table}`);
    }
  });
  logger.info('Test fixture: emptied tables', { scope, tables });
}

async function seedSuccess(scope: string): Promise<void> {
  // Per-scope happy-path seed. Implementations are intentionally
  // small — Maestro just needs ONE row to render the success state.
  switch (scope) {
    case 'bookings':
      await db.query(
        `INSERT INTO bookings (
           customer_id, category_id, scheduled_at, address, status,
           service_price, service_fee, total_amount
         )
         SELECT u.id, c.id, NOW() + INTERVAL '1 day', '123 Test St', 'pending',
                100000, 10000, 110000
           FROM users u, service_categories c
          WHERE u.role = 'customer' AND c.is_active = TRUE
          LIMIT 1
         ON CONFLICT DO NOTHING`,
      );
      break;
    case 'notifications':
      await db.query(
        `INSERT INTO notifications (user_id, type, title, body, data)
         SELECT u.id, 'tier_upgrade', 'Welcome!', 'This is a test notification.', '{}'::jsonb
           FROM users u WHERE u.role = 'customer' LIMIT 1
         ON CONFLICT DO NOTHING`,
      );
      break;
    default:
      throw new Error(`Unknown success-scope "${scope}".`);
  }
  logger.info('Test fixture: seeded success state', { scope });
}
