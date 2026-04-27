/**
 * Phase 03 — Admin runtime settings routes.
 * Mounted at /api/v1/admin/settings (see server.ts).
 */

import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { rbacMiddleware } from '../middleware/rbac.middleware';
import { createAppError } from '../middleware/error.middleware';
import * as settingsService from '../services/settings.service';

const router = Router();

router.use(authMiddleware);
router.use(rbacMiddleware('admin', 'super_admin'));

// POST /cache/flush — bust all settings cache (placed BEFORE :category to avoid shadowing)
router.post('/cache/flush', async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    await settingsService.bustAllCache();
    res.json({ success: true, message: 'Settings cache flushed.' });
  } catch (err) { next(err); }
});

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

// PUT / — bulk update
router.put('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { updates, reason } = req.body as {
      updates?: Array<{ key: string; value: unknown }>;
      reason?: string;
    };

    if (!Array.isArray(updates) || updates.length === 0) {
      throw createAppError('Updates array is required.', 400);
    }
    if (updates.length > 50) {
      throw createAppError('Maximum 50 settings per batch update.', 400);
    }

    const normalized = updates.map((u) => ({ key: u.key, value: String(u.value) }));
    const ua = req.headers['user-agent'];
    const results = await settingsService.bulkUpdateSettings(
      normalized,
      req.user!.userId,
      reason,
      req.ip,
      Array.isArray(ua) ? ua.join(',') : ua,
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

// POST /:key/reset — reset to default value
router.post('/:key/reset', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const updated = await settingsService.resetToDefault(String(req.params.key), req.user!.userId);
    res.json({ success: true, data: settingsService.formatSetting(updated) });
  } catch (err) { next(err); }
});

// PUT /:key — update single setting
router.put('/:key', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { value, reason } = req.body as { value?: unknown; reason?: string };
    if (value === undefined || value === null) {
      throw createAppError('Value is required.', 400);
    }
    const ua = req.headers['user-agent'];
    const updated = await settingsService.updateSetting(
      String(req.params.key),
      String(value),
      req.user!.userId,
      reason,
      req.ip,
      Array.isArray(ua) ? ua.join(',') : ua,
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
