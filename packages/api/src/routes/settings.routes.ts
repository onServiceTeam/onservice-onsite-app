/**
 * Phase 03 — Admin runtime settings routes.
 * Mounted at /api/v1/admin/settings (see server.ts).
 *
 * CRIT-N16 fix (2026-05-02): mutations are now super_admin-only. Reads
 * (GET /, GET /:category, GET /:key/history) remain at admin level so
 * junior admins can observe current values. The platform_settings table
 * holds every money knob (commission rates, fees, refund tiers, etc.) so
 * mutations must be gated at the highest privilege.
 */

import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { rbacMiddleware } from '../middleware/rbac.middleware';
import { createAppError } from '../middleware/error.middleware';
import * as settingsService from '../services/settings.service';

const router = Router();

// All settings routes require authentication. Read access is at the
// admin level (junior admins can view current platform values) but
// every mutation requires super_admin (per CRIT-N16).
router.use(authMiddleware);
router.use(rbacMiddleware('admin', 'super_admin'));

// GET / — all settings, grouped by category
router.get('/', async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const settings = await settingsService.getAllSettings();
    const categories = await settingsService.getCategories();

    const grouped: Record<string, ReturnType<typeof settingsService.formatSetting>[]> = {};
    for (const s of settings) {
      if (!grouped[s.category]) grouped[s.category] = [];
      grouped[s.category]!.push(settingsService.formatSetting(s));
    }

    res.json({ success: true, data: { categories, settings: grouped } });
  } catch (err) { next(err); }
});

// PUT / — bulk update (super_admin only per CRIT-N16)
router.put('/', rbacMiddleware('super_admin'), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { updates, reason } = req.body as {
      updates?: Array<{ key?: unknown; value?: unknown; expectedUpdatedAt?: unknown }>;
      reason?: string;
    };

    if (!Array.isArray(updates) || updates.length === 0) {
      throw createAppError('Updates array is required.', 400);
    }
    if (updates.length > 50) {
      throw createAppError('Maximum 50 settings per batch update.', 400);
    }

    const normalized = updates.map((update, index) => {
      if (!update || typeof update.key !== 'string' || update.key.trim().length === 0) {
        throw createAppError(`Update ${index + 1} requires a setting key.`, 400);
      }
      if (update.value === undefined || update.value === null) {
        throw createAppError(`Update ${index + 1} requires a value.`, 400);
      }
      if (typeof update.expectedUpdatedAt !== 'string') {
        throw createAppError(`Update ${index + 1} requires the setting version. Reload settings and try again.`, 400);
      }
      return {
        key: update.key.trim(),
        value: String(update.value),
        expectedUpdatedAt: update.expectedUpdatedAt,
      };
    });
    const ua = req.headers['user-agent'];
    const results = await settingsService.bulkUpdateSettings(
      normalized,
      {
        changedBy: req.user!.userId,
        reason: typeof reason === 'string' ? reason : '',
        ipAddress: req.ip,
        userAgent: Array.isArray(ua) ? ua.join(',') : ua,
      },
    );

    res.json({
      success: true,
      data: results.map(settingsService.formatSetting),
      message: `${results.length} settings updated.`,
    });
  } catch (err) { next(err); }
});

// GET /:key/history — audit history for one setting
router.get('/:key/history', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const history = await settingsService.getSettingAuditHistory(String(req.params.key), limit);
    res.json({ success: true, data: history });
  } catch (err) { next(err); }
});

// POST /:key/reset — reset to default value (super_admin only per CRIT-N16)
// BUG-PHASE75-01 fix — accept an optional `reason` so the audit row
// records WHY the admin reset, matching the PUT /:key endpoint.
router.post('/:key/reset', rbacMiddleware('super_admin'), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { reason, expectedUpdatedAt } = (req.body ?? {}) as {
      reason?: string;
      expectedUpdatedAt?: string;
    };
    const ua = req.headers['user-agent'];
    const updated = await settingsService.resetToDefault(
      String(req.params.key),
      {
        changedBy: req.user!.userId,
        reason: typeof reason === 'string' ? reason : '',
        expectedUpdatedAt: typeof expectedUpdatedAt === 'string' ? expectedUpdatedAt : '',
        ipAddress: req.ip,
        userAgent: Array.isArray(ua) ? ua.join(',') : ua,
      },
    );
    res.json({ success: true, data: settingsService.formatSetting(updated) });
  } catch (err) { next(err); }
});

// PUT /:key — update single setting (super_admin only per CRIT-N16)
router.put('/:key', rbacMiddleware('super_admin'), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { value, reason, expectedUpdatedAt } = req.body as {
      value?: unknown;
      reason?: string;
      expectedUpdatedAt?: string;
    };
    if (value === undefined || value === null) {
      throw createAppError('Value is required.', 400);
    }
    const ua = req.headers['user-agent'];
    const updated = await settingsService.updateSetting(
      String(req.params.key),
      String(value),
      {
        changedBy: req.user!.userId,
        reason: typeof reason === 'string' ? reason : '',
        expectedUpdatedAt: typeof expectedUpdatedAt === 'string' ? expectedUpdatedAt : '',
        ipAddress: req.ip,
        userAgent: Array.isArray(ua) ? ua.join(',') : ua,
      },
    );
    res.json({ success: true, data: settingsService.formatSetting(updated) });
  } catch (err) { next(err); }
});

// GET /:category — settings for a single category
router.get('/:category', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const settings = await settingsService.getSettingsByCategory(String(req.params.category));
    res.json({ success: true, data: settings.map(settingsService.formatSetting) });
  } catch (err) { next(err); }
});

export default router;
