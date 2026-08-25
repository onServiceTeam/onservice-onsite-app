import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { validationMiddleware } from '../middleware/validation.middleware';
import { suspendProviderSchema, changeProviderTierSchema } from '../validators/admin.validators';
import { createPricingRuleSchema, updatePricingRuleSchema } from '../validators/admin-pricing-rules.validators';
import { createServiceAreaSchema, updateServiceAreaSchema } from '../validators/admin-service-area.validators';
import * as adminService from '../services/admin.service';
import * as escrowService from '../services/escrow.service';
import { createAppError } from '../middleware/error.middleware';
import { db } from '../models/db';
import * as notificationService from '../services/notification.service';
import { logger } from '../utils/logger';
import * as invoiceService from '../services/invoice.service';
import * as businessService from '../services/business.service';
import * as serviceAreaService from '../services/service-area.service';
import * as pricingService from '../services/pricing.service';
import * as slotWaitlistService from '../services/slot-waitlist.service';
import * as dataManagementService from '../services/data-management.service';
import * as securityService from '../services/security.service';
import * as adminAnalyticsService from '../services/admin-analytics.service';

const router = Router();

function requireAdmin(req: AuthenticatedRequest): void {
  if (req.user!.role !== 'admin' && req.user!.role !== 'super_admin') {
    throw createAppError('Admin access required.', 403);
  }
}

function requireSuperAdmin(req: AuthenticatedRequest): void {
  if (req.user!.role !== 'super_admin') {
    throw createAppError('Super admin access required.', 403);
  }
}

router.get(
  '/dashboard',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const kpis = await adminService.getDashboardKpis();
      res.json({ success: true, data: kpis });
    } catch (error) {
      next(error);
    }
  },
);

// ── Phase 04: rich dashboard endpoints (kpis with range, charts, alerts, cities)
router.get(
  '/dashboard/kpis',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const rawRange = typeof req.query['range'] === 'string' ? req.query['range'] : 'today';
      if (!adminAnalyticsService.isDashboardRange(rawRange)) {
        throw createAppError('Invalid range. Allowed: today, 7d, 30d, 90d, ytd.', 400);
      }
      const data = await adminAnalyticsService.getDashboardKpis(rawRange);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/dashboard/revenue-trend',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const days = Number(req.query['days'] ?? 30);
      const data = await adminAnalyticsService.getRevenueTrend(days);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/dashboard/booking-volume',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const days = Number(req.query['days'] ?? 7);
      const data = await adminAnalyticsService.getBookingVolumeByCategory(days);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/dashboard/acquisition-funnel',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const days = Number(req.query['days'] ?? 30);
      const data = await adminAnalyticsService.getCustomerAcquisitionFunnel(days);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/dashboard/alerts',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const data = await adminAnalyticsService.getOperationalAlerts();
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/dashboard/cities',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const data = await adminAnalyticsService.getCitiesPerformance();
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/providers',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const tier = typeof req.query.tier === 'string' ? req.query.tier : undefined;
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      // Phase 200 — dispatch console online-providers feed.
      const online = req.query.online === 'true';

      const { providers, total } = await adminService.listProviders({ status, tier, search, online, page, pageSize });

      res.json({
        success: true,
        data: providers.map(adminService.formatProvider),
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.put(
  '/providers/:id/approve',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const id = req.params['id'];
      if (typeof id !== 'string' || !id) throw createAppError('Provider ID is required.', 400);

      await adminService.approveProvider(id, req.user!.userId);
      res.json({ success: true, data: { message: 'Provider approved.' } });
    } catch (error) {
      next(error);
    }
  },
);

router.put(
  '/providers/:id/reject',
  authMiddleware,
  validationMiddleware(suspendProviderSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const id = req.params['id'];
      if (typeof id !== 'string' || !id) throw createAppError('Provider ID is required.', 400);

      await adminService.rejectProvider(id, req.user!.userId, req.body.reason);
      res.json({ success: true, data: { message: 'Provider application rejected.' } });
    } catch (error) {
      next(error);
    }
  },
);

router.put(
  '/providers/:id/suspend',
  authMiddleware,
  validationMiddleware(suspendProviderSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const id = req.params['id'];
      if (typeof id !== 'string' || !id) throw createAppError('Provider ID is required.', 400);

      await adminService.suspendProvider(id, req.user!.userId, req.body.reason);
      res.json({ success: true, data: { message: 'Provider suspended.' } });
    } catch (error) {
      next(error);
    }
  },
);

router.put(
  '/providers/:id/reactivate',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const id = req.params['id'];
      if (typeof id !== 'string' || !id) throw createAppError('Provider ID is required.', 400);

      await adminService.reactivateProvider(id, req.user!.userId);
      res.json({ success: true, data: { message: 'Provider reactivated.' } });
    } catch (error) {
      next(error);
    }
  },
);

router.put(
  '/providers/:id/tier',
  authMiddleware,
  validationMiddleware(changeProviderTierSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const id = req.params['id'];
      if (typeof id !== 'string' || !id) throw createAppError('Provider ID is required.', 400);

      await adminService.changeProviderTier(id, req.user!.userId, req.body.tier, req.body.reason);
      res.json({ success: true, data: { message: `Provider tier changed to ${req.body.tier}.` } });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/customers',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;

      const { customers, total } = await adminService.listCustomers({ search, status, page, pageSize });

      res.json({
        success: true,
        data: customers.map(adminService.formatCustomer),
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/bookings',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;

      const { bookings, total } = await adminService.listBookingsAdmin({ status, search, page, pageSize });

      res.json({
        success: true,
        data: bookings.map(adminService.formatBookingAdmin),
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/bookings/:id/release-escrow',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const id = req.params['id'];
      if (typeof id !== 'string' || !id) throw createAppError('Booking ID is required.', 400);

      const { reason } = req.body as { reason?: string };
      if (!reason || typeof reason !== 'string' || reason.trim().length < 10) {
        throw createAppError('A detailed reason (min 10 characters) is required for manual escrow release.', 400);
      }

      const booking = await db.query<{ id: string; status: string; escrow_status: string; provider_id: string | null }>(
        `SELECT id, status, escrow_status, provider_id FROM bookings WHERE id = $1`,
        [id],
      );
      if (booking.rows.length === 0) throw createAppError('Booking not found.', 404);
      const bk = booking.rows[0]!;

      if (bk.escrow_status !== 'held') {
        throw createAppError(`Escrow is not held for this booking (current: ${bk.escrow_status}).`, 409);
      }
      if (!bk.provider_id) {
        throw createAppError('No provider assigned — cannot release escrow.', 409);
      }

      const breakdown = await escrowService.releaseEscrow(id);

      await db.query(
        `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details, reason)
         VALUES ($1, 'manual_escrow_release', 'booking', $2, $3, $4)`,
        [req.user!.userId, id,
         JSON.stringify({ breakdown, bookingStatus: bk.status }),
         reason.trim()],
      );

      logger.info('Admin manually released escrow', { bookingId: id, adminId: req.user!.userId });

      res.json({ success: true, data: { message: 'Escrow released successfully.', breakdown } });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/financials/revenue',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const period = (typeof req.query.period === 'string' ? req.query.period : 'daily') as 'daily' | 'weekly' | 'monthly';
      const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));

      const report = await adminService.getRevenueReport(period, days);
      res.json({ success: true, data: report.map(adminService.formatRevenueRow) });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/actions',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));

      // MED-N02 fix: validate adminId is a UUID + actionType is a
      // sane slug shape BEFORE passing to the service. Pre-fix,
      // garbage values either returned empty results or caused
      // unparseable-UUID errors to bubble up as 500. Now: clean
      // 400 with a helpful message.
      const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const ACTION_TYPE_REGEX = /^[a-z][a-z0-9_]{2,80}$/;

      let adminId: string | undefined;
      if (typeof req.query.adminId === 'string' && req.query.adminId.length > 0) {
        if (!UUID_REGEX.test(req.query.adminId)) {
          throw createAppError('adminId must be a valid UUID.', 400);
        }
        adminId = req.query.adminId;
      }

      let actionType: string | undefined;
      if (typeof req.query.actionType === 'string' && req.query.actionType.length > 0) {
        if (!ACTION_TYPE_REGEX.test(req.query.actionType)) {
          throw createAppError(
            'actionType must be lowercase letters, digits, or underscores (3-80 chars).',
            400,
          );
        }
        actionType = req.query.actionType;
      }

      const { actions, total } = await adminService.getAdminActions(
        { adminId, actionType, page, pageSize },
        req.user!.role,  // Phase 14 D08 — Bug 66 PII masking by role
      );

      res.json({
        success: true,
        data: actions.map(adminService.formatAdminAction),
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/recurring',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;

      const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
      const offset = (page - 1) * pageSize;
      const params: unknown[] = [];
      let paramIdx = 1;
      let statusClause = '';
      let searchClause = '';

      if (status && ['active', 'paused', 'cancelled'].includes(status)) {
        statusClause = `AND rb.status = $${paramIdx}`;
        params.push(status);
        paramIdx++;
      }

      if (search) {
        searchClause = `AND (u.first_name ILIKE $${paramIdx} OR u.last_name ILIKE $${paramIdx} OR rb.city ILIKE $${paramIdx} OR rb.province ILIKE $${paramIdx})`;
        params.push(`%${search}%`);
        paramIdx++;
      }

      const countResult = await db.query<{ count: string }>(
        `SELECT COUNT(*)::text as count FROM recurring_bookings rb
         LEFT JOIN users u ON rb.customer_id = u.id
         WHERE 1=1 ${statusClause} ${searchClause}`,
        params,
      );
      const total = Number(countResult.rows[0]?.count ?? 0);

      const dataParams = [...params, pageSize, offset];
      const result = await db.query<Record<string, unknown>>(
        `SELECT rb.*,
                TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS customer_name,
                sc.name AS category_name
         FROM recurring_bookings rb
         LEFT JOIN users u ON rb.customer_id = u.id
         LEFT JOIN service_categories sc ON rb.category_id = sc.id
         WHERE 1=1 ${statusClause} ${searchClause}
         ORDER BY rb.created_at DESC
         LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
        dataParams,
      );

      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const data = result.rows.map((r) => ({
        id: r.id,
        customerId: r.customer_id,
        providerId: r.provider_id,
        categoryId: r.category_id,
        frequency: r.frequency,
        preferredDay: r.preferred_day,
        preferredDayName: dayNames[r.preferred_day as number] ?? '',
        preferredTime: r.preferred_time,
        city: r.city,
        province: r.province,
        totalAmount: r.total_amount,
        status: r.status,
        nextBookingDate: r.next_booking_date,
        totalInstances: r.total_instances,
        createdAt: r.created_at,
        customerName: r.customer_name,
        categoryName: r.category_name,
      }));

      res.json({
        success: true,
        data,
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/recurring/:id/cancel',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const id = req.params.id;
      const { reason } = req.body as { reason?: string };

      // Phase 200 fix — the admin UI requires a >=10-char reason and tells
      // the admin it is "recorded in audit log + sent to customer." Pre-fix
      // the server did neither: it ran a bare UPDATE with no length check,
      // no admin_actions row, and no notification — so the modal's promise
      // was false. Enforce the reason, write the audit row, notify the
      // customer.
      if (!reason || typeof reason !== 'string' || reason.trim().length < 10) {
        throw createAppError('A cancellation reason (min 10 characters) is required.', 400);
      }
      const trimmedReason = reason.trim();

      const result = await db.query<{ customer_id: string; frequency: string }>(
        `UPDATE recurring_bookings
         SET status = 'cancelled', cancelled_at = NOW(), cancellation_reason = $1, updated_at = NOW()
         WHERE id = $2 AND status IN ('active', 'paused')
         RETURNING customer_id, frequency`,
        [trimmedReason, id],
      );

      if ((result.rowCount ?? 0) === 0) {
        res.status(404).json({ success: false, message: 'Recurring booking not found or already cancelled.' });
        return;
      }

      const cancelled = result.rows[0]!;

      await db.query(
        `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details, reason)
         VALUES ($1, 'recurring_booking_cancelled', 'recurring_booking', $2, $3, $4)`,
        [req.user!.userId, id, JSON.stringify({ frequency: cancelled.frequency }), trimmedReason],
      );

      try {
        await notificationService.createPushNotification({
          userId: cancelled.customer_id,
          type: 'recurring_update',
          title: 'Recurring booking cancelled',
          body: `Your recurring booking has been cancelled by our team. Reason: ${trimmedReason}`,
          data: { recurringBookingId: id },
        });
      } catch (notifyErr) {
        // Notification is best-effort — the cancellation itself already
        // committed and is audited. Log and continue so the admin still
        // gets a success response.
        logger.warn('Recurring cancel: customer notification failed', { recurringBookingId: id, error: notifyErr });
      }

      res.json({ success: true, message: 'Recurring booking cancelled.' });
    } catch (error) {
      next(error);
    }
  },
);

// --- B2B / Business Accounts ---

router.get(
  '/business-accounts',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
      const offset = (page - 1) * pageSize;

      const params: unknown[] = [];
      let paramIdx = 1;
      let statusClause = '';
      let searchClause = '';

      if (status && ['pending', 'active', 'suspended', 'closed'].includes(status)) {
        statusClause = `AND ba.status = $${paramIdx}`;
        params.push(status);
        paramIdx++;
      }

      if (search) {
        searchClause = `AND (ba.company_name ILIKE $${paramIdx} OR ba.city ILIKE $${paramIdx} OR ba.contact_person ILIKE $${paramIdx})`;
        params.push(`%${search}%`);
        paramIdx++;
      }

      const countResult = await db.query<{ count: string }>(
        `SELECT COUNT(*)::text as count FROM business_accounts ba WHERE 1=1 ${statusClause} ${searchClause}`,
        params,
      );
      const total = Number(countResult.rows[0]?.count ?? 0);

      const dataParams = [...params, pageSize, offset];
      const result = await db.query<Record<string, unknown>>(
        `SELECT ba.*,
                TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS owner_name,
                TRIM(COALESCE(am.first_name, '') || ' ' || COALESCE(am.last_name, '')) AS manager_name
         FROM business_accounts ba
         LEFT JOIN users u ON ba.owner_user_id = u.id
         LEFT JOIN users am ON ba.account_manager_id = am.id
         WHERE 1=1 ${statusClause} ${searchClause}
         ORDER BY ba.created_at DESC
         LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
        dataParams,
      );

      const data = result.rows.map((r) => ({
        id: r.id,
        companyName: r.company_name,
        businessType: r.business_type,
        city: r.city,
        province: r.province,
        contactPerson: r.contact_person,
        contactEmail: r.contact_email,
        contactPhone: r.contact_phone,
        status: r.status,
        paymentTerms: r.payment_terms,
        volumeDiscountRate: Number(r.volume_discount_rate),
        monthlyCreditLimit: r.monthly_credit_limit,
        ownerName: r.owner_name,
        managerName: r.manager_name,
        createdAt: r.created_at,
      }));

      res.json({
        success: true,
        data,
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      });
    } catch (error) {
      next(error);
    }
  },
);

// Phase 200 — admin B2B detail reads. These power the business-account
// detail page (overview, members, contracts, invoices). All requireAdmin;
// they use the admin service variants that skip the owner membership gate.
router.get(
  '/business-accounts/:id',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const account = await businessService.getBusinessAccountAdmin(req.params.id as string);
      res.json({ success: true, data: businessService.formatBusinessAccount(account) });
    } catch (error) { next(error); }
  },
);

router.get(
  '/business-accounts/:id/members',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const members = await businessService.getMembersAdmin(req.params.id as string);
      res.json({ success: true, data: members.map(businessService.formatMember) });
    } catch (error) { next(error); }
  },
);

router.get(
  '/business-accounts/:id/contracts',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
      const { items, total } = await businessService.getContractsAdmin(req.params.id as string, page, pageSize);
      res.json({
        success: true,
        data: items.map(businessService.formatContract),
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      });
    } catch (error) { next(error); }
  },
);

router.get(
  '/business-accounts/:id/invoices',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
      const { items, total } = await invoiceService.getInvoicesAdmin(req.params.id as string, page, pageSize);
      res.json({
        success: true,
        data: items.map(invoiceService.formatInvoice),
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      });
    } catch (error) { next(error); }
  },
);

// Phase 200 — admin "generate invoice now". Bills the just-ended month for
// this one account on demand instead of waiting for the monthly cron.
// Idempotent: if an invoice for the period already exists, generated = 0.
router.post(
  '/business-accounts/:id/generate-invoice',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const generated = await invoiceService.generateInvoiceForAccount(req.params.id as string);
      res.json({
        success: true,
        data: {
          generated,
          message: generated > 0
            ? 'Invoice generated for last month.'
            : 'No invoice generated — either there are no billable bookings for last month, or an invoice for that period already exists.',
        },
      });
    } catch (error) { next(error); }
  },
);

router.post(
  '/business-accounts/:id/approve',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const id = req.params.id;

      const result = await db.query(
        `UPDATE business_accounts SET status = 'active', updated_at = NOW()
         WHERE id = $1 AND status = 'pending'`,
        [id],
      );

      if ((result.rowCount ?? 0) === 0) {
        res.status(404).json({ success: false, message: 'Business account not found or not pending.' });
        return;
      }

      const account = await db.query<{ owner_user_id: string; company_name: string }>(
        `SELECT owner_user_id, company_name FROM business_accounts WHERE id = $1`,
        [id],
      );

      if (account.rows[0]) {
        await notificationService.createPushNotification({
          userId: account.rows[0].owner_user_id,
          type: 'business_update',
          title: 'Business Account Approved',
          body: `Your business account "${account.rows[0].company_name}" has been approved. You can now create contracts and manage team members.`,
          data: { businessAccountId: id },
        });
      }

      res.json({ success: true, message: 'Business account approved.' });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/business-accounts/:id/suspend',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const id = req.params.id;
      const { reason } = req.body as { reason?: string };

      const result = await db.query(
        `UPDATE business_accounts SET status = 'suspended', notes = COALESCE($1, notes), updated_at = NOW()
         WHERE id = $2 AND status = 'active'`,
        [reason ?? null, id],
      );

      if ((result.rowCount ?? 0) === 0) {
        res.status(404).json({ success: false, message: 'Business account not found or not active.' });
        return;
      }

      res.json({ success: true, message: 'Business account suspended.' });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/business-accounts/:id/assign-manager',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const id = req.params.id;
      const { accountManagerId } = req.body as { accountManagerId: string };

      if (!accountManagerId) {
        res.status(400).json({ success: false, message: 'accountManagerId is required.' });
        return;
      }

      const result = await db.query(
        `UPDATE business_accounts SET account_manager_id = $1, updated_at = NOW() WHERE id = $2`,
        [accountManagerId, id],
      );

      if ((result.rowCount ?? 0) === 0) {
        res.status(404).json({ success: false, message: 'Business account not found.' });
        return;
      }

      res.json({ success: true, message: 'Account manager assigned.' });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/business-accounts/:id/set-discount',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const id = req.params.id;
      const { volumeDiscountRate, monthlyCreditLimit } = req.body as {
        volumeDiscountRate?: number;
        monthlyCreditLimit?: number;
      };

      const setClauses: string[] = ['updated_at = NOW()'];
      const params: unknown[] = [];
      let paramIdx = 1;

      if (volumeDiscountRate !== undefined) {
        if (typeof volumeDiscountRate !== 'number' || volumeDiscountRate < 0 || volumeDiscountRate > 50) {
          res.status(400).json({ success: false, message: 'volumeDiscountRate must be between 0 and 50.' });
          return;
        }
        setClauses.push(`volume_discount_rate = $${paramIdx}`);
        params.push(volumeDiscountRate);
        paramIdx++;
      }

      if (monthlyCreditLimit !== undefined) {
        if (typeof monthlyCreditLimit !== 'number' || monthlyCreditLimit < 0) {
          res.status(400).json({ success: false, message: 'monthlyCreditLimit must be a non-negative number.' });
          return;
        }
        setClauses.push(`monthly_credit_limit = $${paramIdx}`);
        params.push(monthlyCreditLimit);
        paramIdx++;
      }

      params.push(id);
      const result = await db.query(
        `UPDATE business_accounts SET ${setClauses.join(', ')} WHERE id = $${paramIdx}`,
        params,
      );

      if ((result.rowCount ?? 0) === 0) {
        res.status(404).json({ success: false, message: 'Business account not found.' });
        return;
      }

      res.json({ success: true, message: 'Discount settings updated.' });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/invoices/:id/mark-paid',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const id = req.params.id as string;
      const { paymentReference } = req.body as { paymentReference: string };

      if (!paymentReference) {
        res.status(400).json({ success: false, message: 'paymentReference is required.' });
        return;
      }

      const invoice = await invoiceService.markInvoicePaid(id, paymentReference);

      res.json({ success: true, data: invoiceService.formatInvoice(invoice) });
    } catch (error) {
      next(error);
    }
  },
);

// --- Service Areas ---

router.get(
  '/service-areas',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined;

      const result = await serviceAreaService.listServiceAreas(page, pageSize, status, search);

      res.json({
        success: true,
        data: result.items.map(serviceAreaService.formatServiceArea),
        pagination: { page, pageSize, total: result.total, totalPages: Math.ceil(result.total / pageSize) },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/service-areas/stats',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const stats = await serviceAreaService.getServiceAreaStats();
      res.json({ success: true, data: stats });
    } catch (error) {
      next(error);
    }
  },
);

// Phase 14 Dispatch 05 — Bug 320 + Bug 322.
// Replaced the global lat/lng bounds (-90..90, -180..180) with PH
// bounds (4.5..21.5, 116..127.5). Added radiusKm 1..100 and
// minProvidersToLaunch 1..50 enforcement. `.strict()` rejects unknown
// keys. Migration 074 enforces the same bounds at the DB level
// (defense in depth).
router.post(
  '/service-areas',
  authMiddleware,
  validationMiddleware(createServiceAreaSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const body = req.body as {
        name: string;
        city: string;
        province: string;
        region: string;
        zipCodes?: string[];
        centerLat: number;
        centerLng: number;
        radiusKm?: number;
        minProvidersToLaunch?: number;
        launchDate?: string;
        settings?: Record<string, unknown>;
      };

      // MED-N48 fix — pass actor for audit row.
      const area = await serviceAreaService.createServiceArea({
        ...body,
        createdByAdminId: req.user!.userId,
      });

      res.status(201).json({
        success: true,
        data: serviceAreaService.formatServiceArea(area),
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/service-areas/:id',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const id = req.params.id as string;
      const area = await serviceAreaService.getServiceArea(id);
      res.json({ success: true, data: serviceAreaService.formatServiceArea(area) });
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  '/service-areas/:id',
  authMiddleware,
  validationMiddleware(updateServiceAreaSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const id = req.params.id as string;
      const updates = req.body as Record<string, unknown>;

      const area = await serviceAreaService.updateServiceArea(id, updates);
      res.json({ success: true, data: serviceAreaService.formatServiceArea(area) });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/service-areas/:id/activate',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const id = req.params.id as string;

      const area = await serviceAreaService.updateServiceArea(id, { status: 'active' });
      await serviceAreaService.notifyWaitlist(id);

      res.json({ success: true, data: serviceAreaService.formatServiceArea(area), message: 'Service area activated and waitlist notified.' });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/service-areas/:id/pause',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const id = req.params.id as string;

      const area = await serviceAreaService.updateServiceArea(id, { status: 'paused' });
      res.json({ success: true, data: serviceAreaService.formatServiceArea(area) });
    } catch (error) {
      next(error);
    }
  },
);

// Multi-city — make this area the app default (map center + default pickers
// in the mobile apps). Exactly one area is the default at a time.
router.post(
  '/service-areas/:id/set-default',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const id = req.params.id as string;

      const area = await serviceAreaService.setDefaultServiceArea(id, req.user!.userId);
      res.json({ success: true, data: serviceAreaService.formatServiceArea(area), message: 'Default service area updated.' });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/service-areas/:id/providers',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const id = req.params.id as string;
      const providers = await serviceAreaService.getAreaProviders(id);

      res.json({
        success: true,
        data: providers.map((p) => ({
          providerId: p.provider_id,
          businessName: p.business_name,
          tier: p.tier,
          averageRating: Number(p.rating),
          isPrimary: p.is_primary,
        })),
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/service-areas/:id/providers',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const areaId = req.params.id as string;
      const { providerId, isPrimary } = req.body as { providerId: string; isPrimary?: boolean };

      if (!providerId) {
        res.status(400).json({ success: false, message: 'providerId is required.' });
        return;
      }

      const assignment = await serviceAreaService.assignProviderToArea(providerId, areaId, isPrimary);
      res.status(201).json({ success: true, data: assignment });
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  '/service-areas/:areaId/providers/:providerId',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const { areaId, providerId } = req.params;
      await serviceAreaService.removeProviderFromArea(providerId as string, areaId as string);
      res.json({ success: true, message: 'Provider removed from area.' });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/service-areas-waitlist',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
      const city = typeof req.query.city === 'string' ? req.query.city.trim() : undefined;
      const notifiedParam = req.query.notified;
      const notifiedFilter = notifiedParam === 'true' ? true : notifiedParam === 'false' ? false : undefined;

      const result = await serviceAreaService.getWaitlist(page, pageSize, city, notifiedFilter);

      res.json({
        success: true,
        data: result.items.map(serviceAreaService.formatWaitlistEntry),
        pagination: { page, pageSize, total: result.total, totalPages: Math.ceil(result.total / pageSize) },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/service-areas/:id/notify-waitlist',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const id = req.params.id as string;
      const notified = await serviceAreaService.notifyWaitlist(id);
      res.json({ success: true, data: { notifiedCount: notified } });
    } catch (error) {
      next(error);
    }
  },
);

// --- Pricing Rules CRUD ---

router.get(
  '/pricing-rules',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
      const type = typeof req.query.type === 'string' ? req.query.type : undefined;
      const isActiveParam = req.query.isActive;
      const isActive = isActiveParam === 'true' ? true : isActiveParam === 'false' ? false : undefined;

      const result = await pricingService.listPricingRules({ type, isActive, page, pageSize });

      res.json({
        success: true,
        data: result.items.map(pricingService.formatPricingRule),
        pagination: { page, pageSize, total: result.total, totalPages: Math.ceil(result.total / pageSize) },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/pricing-rules/:id',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const id = req.params.id as string;
      const rule = await pricingService.getPricingRuleById(id);
      res.json({ success: true, data: pricingService.formatPricingRule(rule) });
    } catch (error) {
      next(error);
    }
  },
);

// Phase 14 Dispatch 05 — Bug 269.
// Replaced manual validation with `validationMiddleware(createPricingRuleSchema)`.
// The new Zod schema enforces `multiplier 1.0..5.0` AND
// `platformSurgeShare 0..1` (the latter was previously unbounded — a
// typo could make the platform retain 50× the surge or take a negative
// split). `.strict()` rejects unknown keys.
router.post(
  '/pricing-rules',
  authMiddleware,
  validationMiddleware(createPricingRuleSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const body = req.body as {
        name: string;
        type: 'rush' | 'holiday' | 'peak_hours';
        multiplier: number;
        rushHoursThreshold?: number;
        holidayDate?: string;
        peakStartTime?: string;
        peakEndTime?: string;
        peakDaysOfWeek?: number[];
        categoryId?: string;
        serviceAreaId?: string;
        priority?: number;
        platformSurgeShare?: number;
        description?: string;
      };

      // MED-N110 fix — pass acting admin id so service writes audit row.
      const rule = await pricingService.createPricingRule(body, req.user!.userId);

      res.status(201).json({ success: true, data: pricingService.formatPricingRule(rule) });
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  '/pricing-rules/:id',
  authMiddleware,
  validationMiddleware(updatePricingRuleSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const id = req.params.id as string;
      // MED-N111 fix — pass acting admin id so service writes audit row.
      const rule = await pricingService.updatePricingRule(id, req.body, req.user!.userId);
      res.json({ success: true, data: pricingService.formatPricingRule(rule) });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/pricing-rules/:id/toggle',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const id = req.params.id as string;
      const { isActive } = req.body as { isActive: boolean };
      if (typeof isActive !== 'boolean') throw createAppError('isActive must be a boolean.', 400);
      // MED-N111 fix — pass acting admin id so service writes audit row.
      const rule = await pricingService.togglePricingRule(id, isActive, req.user!.userId);
      res.json({ success: true, data: pricingService.formatPricingRule(rule) });
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  '/pricing-rules/:id',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const id = req.params.id as string;
      // MED-N111 fix — pass acting admin id so service writes audit row.
      await pricingService.deletePricingRule(id, req.user!.userId);
      res.json({ success: true, message: 'Pricing rule deleted.' });
    } catch (error) {
      next(error);
    }
  },
);

// --- Slot Waitlist Admin ---

router.get(
  '/slot-waitlist-stats',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
      const city = typeof req.query.city === 'string' ? req.query.city.trim() : undefined;

      const result = await slotWaitlistService.getSlotWaitlistStats(city, page, pageSize);

      res.json({
        success: true,
        data: result.items,
        pagination: { page, pageSize, total: result.total, totalPages: Math.ceil(result.total / pageSize) },
      });
    } catch (error) {
      next(error);
    }
  },
);

// --- Data Management Admin ---

router.get(
  '/data-exports',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;

      const result = await dataManagementService.listDataExportRequests(page, pageSize, status);

      res.json({
        success: true,
        data: result.items.map(dataManagementService.formatDataExport),
        pagination: { page, pageSize, total: result.total, totalPages: Math.ceil(result.total / pageSize) },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/account-deletions',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;

      const result = await dataManagementService.listAccountDeletionRequests(page, pageSize, status);

      res.json({
        success: true,
        data: result.items.map(dataManagementService.formatAccountDeletion),
        pagination: { page, pageSize, total: result.total, totalPages: Math.ceil(result.total / pageSize) },
      });
    } catch (error) {
      next(error);
    }
  },
);

// --- Security Admin ---

router.get(
  '/blocked-ips',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));

      const result = await securityService.listBlockedIps(page, pageSize);

      res.json({
        success: true,
        data: result.items.map(securityService.formatBlockedIp),
        pagination: { page, pageSize, total: result.total, totalPages: Math.ceil(result.total / pageSize) },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/blocked-ips',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const { ipAddress, reason, expiresInHours } = req.body;

      if (typeof ipAddress !== 'string' || !ipAddress) {
        throw createAppError('IP address is required.', 400);
      }
      if (typeof reason !== 'string' || !reason) {
        throw createAppError('Reason is required.', 400);
      }

      const blocked = await securityService.blockIp({
        ipAddress,
        reason,
        blockedBy: req.user!.userId,
        expiresInHours: typeof expiresInHours === 'number' ? expiresInHours : undefined,
      });

      res.status(201).json({
        success: true,
        data: securityService.formatBlockedIp(blocked),
      });
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  '/blocked-ips/:ipAddress',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const ipAddress = String(req.params.ipAddress ?? '');
      const unblocked = await securityService.unblockIp(
        ipAddress,
        req.user!.userId,
      );

      if (!unblocked) {
        res.status(404).json({
          success: false,
          error: { message: 'Blocked IP not found.', statusCode: 404 },
        });
        return;
      }

      res.json({ success: true, message: 'IP unblocked.' });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/security-events',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
      const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
      const eventType = typeof req.query.eventType === 'string' ? req.query.eventType : undefined;
      const ipAddress = typeof req.query.ipAddress === 'string' ? req.query.ipAddress : undefined;

      const result = await securityService.listSecurityEvents(page, pageSize, {
        userId,
        eventType,
        ipAddress,
      });

      res.json({
        success: true,
        data: result.items.map(securityService.formatSecurityEvent),
        pagination: { page, pageSize, total: result.total, totalPages: Math.ceil(result.total / pageSize) },
      });
    } catch (error) {
      next(error);
    }
  },
);

// ────────────────────────────────────────────────────────────────────
// Admin Analytics (Issues 191-200)
// ────────────────────────────────────────────────────────────────────

// --- A/B Testing ---

router.get(
  '/analytics/ab-tests',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
      const result = await adminAnalyticsService.listAbTests(status, page, pageSize);
      res.json({
        success: true,
        data: result.items.map(adminAnalyticsService.formatAbTest),
        pagination: { page, pageSize, total: result.total, totalPages: Math.ceil(result.total / pageSize) },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/analytics/ab-tests',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const { name, description, variantAName, variantBName, variantAConfig, variantBConfig, targetMetric, trafficSplit, startDate, endDate } = req.body;
      if (!name || typeof name !== 'string') throw createAppError('name is required.', 400);
      const test = await adminAnalyticsService.createAbTest({
        name, description, variantAName, variantBName, variantAConfig, variantBConfig,
        targetMetric, trafficSplit, startDate, endDate, createdBy: req.user!.userId,
      });
      res.status(201).json({ success: true, data: adminAnalyticsService.formatAbTest(test) });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/analytics/ab-tests/:testId/results',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const testId = req.params['testId'];
      if (!testId || typeof testId !== 'string') throw createAppError('testId is required.', 400);
      const results = await adminAnalyticsService.getAbTestResults(testId);
      res.json({
        success: true,
        data: {
          test: adminAnalyticsService.formatAbTest(results.test),
          variantA: results.variantA,
          variantB: results.variantB,
          winner: results.winner,
          confidence: results.confidence,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  '/analytics/ab-tests/:testId/status',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const testId = req.params['testId'];
      if (!testId || typeof testId !== 'string') throw createAppError('testId is required.', 400);
      const { status } = req.body as { status: string };
      if (!status || !['draft', 'active', 'paused', 'completed'].includes(status)) {
        throw createAppError('status must be draft, active, paused, or completed.', 400);
      }
      const test = await adminAnalyticsService.updateAbTestStatus(
        testId, status as 'draft' | 'active' | 'paused' | 'completed',
      );
      res.json({ success: true, data: adminAnalyticsService.formatAbTest(test) });
    } catch (error) {
      next(error);
    }
  },
);

// --- Cohort Analysis ---

router.get(
  '/analytics/cohorts',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const months = Math.min(12, Math.max(1, Number(req.query.months) || 6));
      const metric = (typeof req.query.metric === 'string' && ['retention', 'revenue'].includes(req.query.metric))
        ? req.query.metric as 'retention' | 'revenue'
        : 'retention';
      const cohorts = await adminAnalyticsService.getCohortAnalysis(months, metric);
      res.json({ success: true, data: cohorts });
    } catch (error) {
      next(error);
    }
  },
);

// --- Churn Prediction ---

router.get(
  '/analytics/churn',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
      const riskLevel = typeof req.query.riskLevel === 'string' ? req.query.riskLevel : undefined;
      const result = await adminAnalyticsService.getChurnPrediction(
        page,
        pageSize,
        riskLevel,
        req.user!.role === 'super_admin' ? 'super_admin' : 'admin',
      );
      res.json({
        success: true,
        data: result.items,
        pagination: { page, pageSize, total: result.total, totalPages: Math.ceil(result.total / pageSize) },
      });
    } catch (error) {
      next(error);
    }
  },
);

// --- Provider Quality Scores ---

router.get(
  '/analytics/quality-scores',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
      const sortBy = (typeof req.query.sortBy === 'string' && ['overall', 'rating', 'completion', 'timeliness'].includes(req.query.sortBy))
        ? req.query.sortBy as 'overall' | 'rating' | 'completion' | 'timeliness'
        : 'overall';
      const result = await adminAnalyticsService.getProviderQualityScores(page, pageSize, sortBy);
      res.json({
        success: true,
        data: result.items,
        pagination: { page, pageSize, total: result.total, totalPages: Math.ceil(result.total / pageSize) },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/analytics/quality-scores/compute',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const periodDays = Math.min(365, Math.max(7, Number(req.body.periodDays) || 90));
      const count = await adminAnalyticsService.computeProviderQualityScores(periodDays);
      res.json({ success: true, data: { computedCount: count, periodDays } });
    } catch (error) {
      next(error);
    }
  },
);

// --- Quality Watch (read-only) ---
//
// Providers needing attention: low rating, NBI expiring, or a dispute spike.
// Same admin RBAC as the other /analytics routes. Read-only.
router.get(
  '/analytics/quality-watch',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const data = await adminAnalyticsService.getQualityWatch();
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

// --- Commission Optimization ---

router.get(
  '/analytics/commission-optimization',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const suggestions = await adminAnalyticsService.getCommissionOptimizationSuggestions();
      res.json({ success: true, data: suggestions });
    } catch (error) {
      next(error);
    }
  },
);

// --- Audit Log ---
//
// Backed by a UNION ALL across two tables:
//   * audit_log     — generic per-request log (any user, any action).
//   * admin_actions — privileged actions (staff_added/removed,
//                     consent_version_published, dsr_*, service_area_*,
//                     promotion_*, notification_template_*, etc.).
//
// Pre-fix this endpoint only read audit_log, so admin-side staff +
// catalog + DSR mutations were invisible from the audit timeline UI
// even though they were fully recorded server-side. The UNION shape
// preserves backward-compat field names (action, entityType, etc.)
// and adds a `source` discriminator so the operator can distinguish
// the two streams in the UI.

interface AuditLogRow {
  id: string;
  source: 'audit_log' | 'admin_actions';
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_values: unknown;
  new_values: unknown;
  ip_address: string | null;
  user_agent: string | null;
  reason: string | null;
  created_at: Date;
  user_email: string | null;
  user_role: string | null;
}

router.get(
  '/audit-log',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 50));
      const offset = (page - 1) * pageSize;

      // Filters are applied to the unioned subquery via an outer
      // WHERE so they hit both source tables consistently.
      const filters: string[] = [];
      const params: unknown[] = [];
      let paramIdx = 1;

      if (req.query.userId && typeof req.query.userId === 'string') {
        filters.push(`combined.user_id = $${paramIdx++}`);
        params.push(req.query.userId);
      }
      if (req.query.action && typeof req.query.action === 'string') {
        filters.push(`combined.action ILIKE $${paramIdx++}`);
        params.push(`%${req.query.action}%`);
      }
      if (req.query.entityType && typeof req.query.entityType === 'string') {
        filters.push(`combined.entity_type = $${paramIdx++}`);
        params.push(req.query.entityType);
      }
      // BUG-PHASE133-01 fix — pre-fix passed YYYY-MM-DD strings
      // directly to a timestamptz comparison, so Pg interpreted them
      // as UTC midnight (= 08:00 Manila). Same shape as the marketing
      // bug fixed in Phase 132. The to-side `<= $N` was especially
      // bad here: an admin filtering "to: 2026-05-31" would EXCLUDE
      // 16 hours of audit-log entries from 08:00-23:59 Manila on
      // May 31. Now the bounds are anchored to Manila wall-clock
      // dates: `>= manila_midnight(date)` (inclusive) and
      // `< manila_midnight(date + 1day)` (half-open, includes whole
      // to-day Manila). Same Manila TZ correction shape as Phases
      // 109/113/117/119/122/123/124/129/130/132.
      if (req.query.from && typeof req.query.from === 'string') {
        filters.push(`combined.created_at >= ($${paramIdx++}::date AT TIME ZONE 'Asia/Manila')`);
        params.push(req.query.from);
      }
      if (req.query.to && typeof req.query.to === 'string') {
        filters.push(`combined.created_at < (($${paramIdx++}::date + INTERVAL '1 day') AT TIME ZONE 'Asia/Manila')`);
        params.push(req.query.to);
      }
      if (req.query.source && typeof req.query.source === 'string') {
        // 'audit_log' | 'admin_actions' — restrict to a single stream.
        filters.push(`combined.source = $${paramIdx++}`);
        params.push(req.query.source);
      }

      const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

      // The unioned base relation. admin_actions contributes its
      // `details` JSONB as new_values, NULL for old_values, and the
      // human-readable `reason` column. audit_log doesn't have a
      // reason field; we emit NULL.
      const baseRelation = `
        SELECT 'audit_log'::text AS source,
               id, user_id, action, entity_type, entity_id,
               old_values, new_values, ip_address::text AS ip_address,
               user_agent, NULL::text AS reason, created_at
          FROM audit_log
        UNION ALL
        SELECT 'admin_actions'::text AS source,
               id, admin_id AS user_id, action_type AS action,
               target_type AS entity_type, target_id AS entity_id,
               NULL::jsonb AS old_values,
               details AS new_values,
               NULL::text AS ip_address,
               NULL::text AS user_agent,
               reason, created_at
          FROM admin_actions
      `;

      const countResult = await db.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
           FROM (${baseRelation}) combined
         ${whereClause}`,
        params,
      );
      const total = Number(countResult.rows[0]?.count ?? 0);

      const dataResult = await db.query<AuditLogRow>(
        `SELECT combined.*, u.email AS user_email, u.role AS user_role
           FROM (${baseRelation}) combined
           LEFT JOIN users u ON u.id = combined.user_id
         ${whereClause}
         ORDER BY combined.created_at DESC
         LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
        [...params, pageSize, offset],
      );

      res.json({
        success: true,
        data: dataResult.rows.map((r) => ({
          id: r.id,
          source: r.source,
          userId: r.user_id,
          userEmail: r.user_email,
          userRole: r.user_role,
          action: r.action,
          entityType: r.entity_type,
          entityId: r.entity_id,
          oldValues: r.old_values,
          newValues: r.new_values,
          ipAddress: r.ip_address,
          userAgent: r.user_agent,
          reason: r.reason,
          createdAt: r.created_at,
        })),
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      });
    } catch (error) {
      next(error);
    }
  },
);

// ─── Platform Settings ──────────────────────────────────────
// Phase 03: the inline /settings and /settings/:key handlers that previously
// lived here have moved to packages/api/src/routes/settings.routes.ts and are
// mounted at /api/v1/admin/settings (see server.ts). The new service is
// schema-aware (categories, validation, audit, cache).

export default router;
