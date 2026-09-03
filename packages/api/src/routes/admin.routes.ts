import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { validationMiddleware } from '../middleware/validation.middleware';
import {
  adminProviderListQuerySchema,
  assignBusinessAccountManagerSchema,
  businessAccountIdParamsSchema,
  suspendProviderSchema,
  changeProviderTierSchema,
} from '../validators/admin.validators';
import {
  createPricingRuleSchema,
  pricingRuleIdParamsSchema,
  pricingRuleListQuerySchema,
  previewPricingRuleSchema,
  publishPricingRuleSchema,
  retirePricingRuleSchema,
  updatePricingRuleSchema,
  type CreatePricingRuleInput,
  type PreviewPricingRuleInput,
  type UpdatePricingRuleInput,
} from '../validators/admin-pricing-rules.validators';
import {
  businessAccountParamsSchema,
  businessContractListQuerySchema,
  businessContractParamsSchema,
  businessInvoiceParamsSchema,
  businessInvoicePaymentParamsSchema,
  businessInvoicePreviewSchema,
  businessLifecycleDecisionSchema,
  finalizeBusinessInvoiceSchema,
  prepareBusinessInvoiceSchema,
  previewBusinessTermsSchema,
  publishBusinessContractSchema,
  publishBusinessTermsSchema,
  recordBusinessInvoiceAdjustmentSchema,
  recordBusinessInvoicePaymentSchema,
  reverseBusinessInvoicePaymentSchema,
  voidBusinessInvoiceSchema,
  type BusinessInvoicePreviewInput,
  type BusinessContractListQuery,
  type PreviewBusinessTermsInput,
  type RecordBusinessInvoiceAdjustmentInput,
  type RecordBusinessInvoicePaymentInput,
  type ReverseBusinessInvoicePaymentInput,
} from '../validators/admin-business.validators';
import {
  createServiceAreaSchema,
  serviceAreaIdParamsSchema,
  serviceAreaListQuerySchema,
  serviceAreaLifecycleReasonSchema,
  serviceAreaProviderParamsSchema,
  serviceAreaWaitlistQuerySchema,
  updateServiceAreaSchema,
} from '../validators/admin-service-area.validators';
import * as adminService from '../services/admin.service';
import * as escrowService from '../services/escrow.service';
import { createAppError } from '../middleware/error.middleware';
import { db } from '../models/db';
import * as notificationService from '../services/notification.service';
import { logger } from '../utils/logger';
import { formatPHP } from '../utils/currency';
import * as invoiceService from '../services/invoice.service';
import * as businessService from '../services/business.service';
import * as businessControlService from '../services/business-control.service';
import * as businessInvoiceControlService from '../services/business-invoice-control.service';
import * as serviceAreaService from '../services/service-area.service';
import * as pricingService from '../services/pricing.service';
import * as pricingPublicationService from '../services/pricing-publication.service';
import * as slotWaitlistService from '../services/slot-waitlist.service';
import * as dataManagementService from '../services/data-management.service';
import * as securityService from '../services/security.service';
import * as adminAnalyticsService from '../services/admin-analytics.service';
import * as settingsService from '../services/settings.service';
import * as recurringService from '../services/recurring.service';
import {
  adminRecurringCancelBodySchema,
  adminRecurringListQuerySchema,
  type AdminRecurringListQuery,
  recurringIdParamsSchema,
  recurringPaginationQuerySchema,
  type RecurringPaginationQuery,
} from '../validators/recurring.validators';
import {
  blockIpBodySchema,
  blockedIpListQuerySchema,
  blockedIpParamsSchema,
  securityEventListQuerySchema,
  unblockIpBodySchema,
} from '../validators/admin-security.validators';
import { parseAuditTimelineListQuery } from '../validators/admin-audit-log.validators';
import {
  maskEmail,
  maskIp,
  maskPiiInObject,
  maskPiiInString,
  maskUserAgent,
  type Json,
} from '../utils/pii-mask';
import { generalAuditVisibilityClause } from '../utils/admin-audit-visibility';

const router = Router();
const PROVIDER_ID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateProviderId(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): void {
  const providerId = req.params.id;
  if (typeof providerId !== 'string' || !PROVIDER_ID_REGEX.test(providerId)) {
    next(createAppError('Provider ID must be a valid UUID.', 400));
    return;
  }
  next();
}

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

async function requireAbTestingEnabled(): Promise<void> {
  const enabled = await settingsService.getSettingBoolean('feature_flag.ab_testing_enabled');
  if (!enabled) {
    throw createAppError(
      'A/B testing is held until assignment and exposure reporting are launched.',
      409,
    );
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
  validationMiddleware({ query: adminProviderListQuerySchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const query = req.query as unknown as {
        page?: number;
        pageSize?: number;
        status?: string;
        tier?: string;
        search?: string;
        online?: boolean;
        serviceAreaId?: string;
      };
      const page = query.page ?? 1;
      const pageSize = query.pageSize ?? 20;
      const status = query.status;
      const tier = query.tier;
      const search = query.search;
      // Phase 200 — dispatch console online-providers feed.
      const online = query.online ?? false;
      const serviceAreaId = query.serviceAreaId;

      const { providers, total } = await adminService.listProviders({
        status, tier, search, online, serviceAreaId, page, pageSize,
      });

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
  validateProviderId,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const id = req.params['id'];
      if (typeof id !== 'string' || !id) throw createAppError('Provider ID is required.', 400);

      await adminService.approveProvider(id, req.user!.userId, {
        reason: req.body?.reason,
        checklistConfirmed: req.body?.checklistConfirmed,
        checklistSummary: req.body?.checklistSummary,
      });
      res.json({ success: true, data: { message: 'Provider approved.' } });
    } catch (error) {
      next(error);
    }
  },
);

router.put(
  '/providers/:id/reject',
  authMiddleware,
  validateProviderId,
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
  validateProviderId,
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
  validateProviderId,
  validationMiddleware(suspendProviderSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const id = req.params['id'];
      if (typeof id !== 'string' || !id) throw createAppError('Provider ID is required.', 400);

      await adminService.reactivateProvider(id, req.user!.userId, req.body.reason);
      res.json({ success: true, data: { message: 'Provider reactivated.' } });
    } catch (error) {
      next(error);
    }
  },
);

router.put(
  '/providers/:id/tier',
  authMiddleware,
  validateProviderId,
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
      const sort = typeof req.query.sort === 'string' ? req.query.sort : undefined;

      const { customers, total, summary } = await adminService.listCustomers({ search, status, sort, page, pageSize });

      res.json({
        success: true,
        data: customers.map((customer) => adminService.formatCustomer(customer, req.user!.role)),
        summary,
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
      const view = typeof req.query.view === 'string' ? req.query.view : undefined;
      const sort = typeof req.query.sort === 'string' ? req.query.sort : undefined;
      const businessAccountId = typeof req.query.businessAccountId === 'string'
        ? req.query.businessAccountId
        : undefined;

      const { bookings, total, summary } = await adminService.listBookingsAdmin({
        status,
        search,
        view,
        sort,
        businessAccountId,
        page,
        pageSize,
      });

      res.json({
        success: true,
        data: bookings.map(adminService.formatBookingAdmin),
        summary,
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
  validationMiddleware({ query: adminRecurringListQuerySchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const { page, pageSize, status, search = '' } = req.query as unknown as AdminRecurringListQuery;
      const offset = (page - 1) * pageSize;
      const params: unknown[] = [];
      let paramIdx = 1;
      let statusClause = '';
      let searchClause = '';

      if (status) {
        statusClause = `AND rb.status = $${paramIdx}`;
        params.push(status);
        paramIdx++;
      }

      if (search) {
        // BUG-UX-913: support operators search people by the full name they
        // see in the queue. Comparing only each name column made a query such
        // as "Maria Santos" return nothing even when that exact customer was
        // visible. Match the normalized display name as well as each part.
        searchClause = `AND (TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) ILIKE $${paramIdx} OR u.first_name ILIKE $${paramIdx} OR u.last_name ILIKE $${paramIdx} OR rb.city ILIKE $${paramIdx} OR rb.province ILIKE $${paramIdx})`;
        params.push(`%${search}%`);
        paramIdx++;
      }

      const countResult = await db.query<{
        count: string;
        active_count: string;
        attention_count: string;
        open_support_count: string;
      }>(
        `SELECT COUNT(*)::text AS count,
                COUNT(*) FILTER (WHERE rb.status = 'active')::text AS active_count,
                COUNT(*) FILTER (WHERE EXISTS (
                  SELECT 1 FROM recurring_instances ri
                   WHERE ri.recurring_booking_id = rb.id AND ri.status = 'failed'
                ))::text AS attention_count,
                COALESCE(SUM(recurring_support.open_count), 0)::text AS open_support_count
         FROM recurring_bookings rb
         LEFT JOIN users u ON rb.customer_id = u.id
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::int AS open_count
             FROM recurring_instances ri
             JOIN support_tickets st ON st.booking_id = ri.booking_id
            WHERE ri.recurring_booking_id = rb.id
              AND st.status NOT IN ('resolved', 'closed')
         ) recurring_support ON TRUE
         WHERE 1=1 ${statusClause} ${searchClause}`,
        params,
      );
      const totals = countResult.rows[0];
      const total = Number(totals?.count ?? 0);

      const dataParams = [...params, pageSize, offset];
      const result = await db.query<Record<string, unknown>>(
        `SELECT rb.*,
                TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS customer_name,
                sc.name AS category_name,
                ssc.name AS subcategory_name,
                COALESCE(
                  NULLIF(TRIM(p.business_name), ''),
                  NULLIF(TRIM(COALESCE(pu.first_name, '') || ' ' || COALESCE(pu.last_name, '')), '')
                ) AS provider_name,
                (SELECT COUNT(*)::int FROM recurring_instances ri
                  WHERE ri.recurring_booking_id = rb.id AND ri.status = 'failed') AS failed_instances,
                (SELECT COUNT(*)::int
                   FROM recurring_instances ri
                   JOIN support_tickets st ON st.booking_id = ri.booking_id
                  WHERE ri.recurring_booking_id = rb.id
                    AND st.status NOT IN ('resolved', 'closed')) AS open_support_tickets
         FROM recurring_bookings rb
         LEFT JOIN users u ON rb.customer_id = u.id
         LEFT JOIN providers p ON rb.provider_id = p.id
         LEFT JOIN users pu ON p.user_id = pu.id
         LEFT JOIN service_categories sc ON rb.category_id = sc.id
         LEFT JOIN service_subcategories ssc ON rb.subcategory_id = ssc.id
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
        subcategoryName: r.subcategory_name,
        providerName: r.provider_name,
        originalBookingId: r.original_booking_id,
        failedInstances: Number(r.failed_instances ?? 0),
        openSupportTickets: Number(r.open_support_tickets ?? 0),
      }));

      res.json({
        success: true,
        data,
        summary: {
          matchingSeries: total,
          activeSeries: Number(totals?.active_count ?? 0),
          seriesWithFailedInstances: Number(totals?.attention_count ?? 0),
          openSupportTickets: Number(totals?.open_support_count ?? 0),
        },
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/recurring/:id',
  authMiddleware,
  validationMiddleware({ params: recurringIdParamsSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const id = req.params.id as string;
      const detail = await recurringService.getAdminRecurringBooking(id);
      res.json({ success: true, data: detail });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/recurring/:id/instances',
  authMiddleware,
  validationMiddleware({
    params: recurringIdParamsSchema,
    query: recurringPaginationQuerySchema,
  }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const id = req.params.id as string;
      const { page, pageSize } = req.query as unknown as RecurringPaginationQuery;
      const result = await recurringService.getAdminRecurringInstances(id, page, pageSize);
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
  '/recurring/:id/cancel',
  authMiddleware,
  validationMiddleware({
    params: recurringIdParamsSchema,
    body: adminRecurringCancelBodySchema,
  }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const id = req.params.id as string;
      const { reason: trimmedReason } = req.body as { reason: string };

      // Phase 200 fix — the admin UI requires a >=10-char reason and tells
      // the admin it is "recorded in audit log + sent to customer." Pre-fix
      // the server did neither: it ran a bare UPDATE with no length check,
      // no admin_actions row, and no notification — so the modal's promise
      // was false. Enforce the reason, write the audit row, notify the
      // customer.
      // BUG-OPS-321 — the cancellation and its admin audit evidence are one
      // decision. Pre-fix, the UPDATE committed first; an admin_actions write
      // failure left a cancelled series with no operator record even though
      // the request returned an error. Commit or roll back both together.
      const cancelled = await db.transaction(async (client) => {
        const result = await client.query<{ customer_id: string; frequency: string }>(
          `UPDATE recurring_bookings
           SET status = 'cancelled', cancelled_at = NOW(), cancellation_reason = $1, updated_at = NOW()
           WHERE id = $2 AND status IN ('active', 'paused')
           RETURNING customer_id, frequency`,
          [trimmedReason, id],
        );
        if ((result.rowCount ?? 0) === 0) {
          throw createAppError('Recurring booking not found or already cancelled.', 404);
        }
        const row = result.rows[0]!;
        await client.query(
          `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details, reason)
           VALUES ($1, 'recurring_booking_cancelled', 'recurring_booking', $2, $3, $4)`,
          [req.user!.userId, id, JSON.stringify({ frequency: row.frequency }), trimmedReason],
        );
        return row;
      });

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
  validationMiddleware({
    params: businessAccountParamsSchema,
    query: businessContractListQuerySchema,
  }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const { page, pageSize, contractId } = req.query as unknown as BusinessContractListQuery;
      const { items, total } = await businessService.getContractsAdmin(
        req.params.id as string,
        page,
        pageSize,
        contractId,
      );
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

// E55 Option A: statement preparation is previewed, stored as a draft, and
// finalized by a separate super-admin decision. These are commercial
// statements, not claims of BIR principal-invoice authority (E22 remains).
router.post(
  '/business-accounts/:id/invoices/preview',
  authMiddleware,
  validationMiddleware({ params: businessAccountParamsSchema, body: businessInvoicePreviewSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const preview = await businessInvoiceControlService.previewInvoiceForAccount(
        req.params.id as string,
        req.body as BusinessInvoicePreviewInput,
        req.user!.userId,
      );
      res.json({ success: true, data: preview });
    } catch (error) { next(error); }
  },
);

router.post(
  '/business-accounts/:id/invoices/prepare',
  authMiddleware,
  validationMiddleware({ params: businessAccountParamsSchema, body: prepareBusinessInvoiceSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const { previewId, reason } = req.body as { previewId: string; reason: string };
      const drafts = await businessInvoiceControlService.prepareInvoiceDrafts({
        accountId: req.params.id as string,
        previewId,
        actorId: req.user!.userId,
        reason,
      });
      res.status(201).json({
        success: true,
        data: drafts.map(invoiceService.formatInvoice),
      });
    } catch (error) { next(error); }
  },
);

router.post(
  '/business-accounts/:id/generate-invoice',
  authMiddleware,
  validationMiddleware({ params: businessAccountParamsSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      res.status(410).json({
        success: false,
        message: 'Immediate invoice generation was retired. Preview candidates, prepare a draft statement, then finalize it separately.',
      });
    } catch (error) { next(error); }
  },
);

router.post(
  '/business-accounts/:id/approve/preview',
  authMiddleware,
  validationMiddleware({ params: businessAccountParamsSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const preview = await businessControlService.previewAccountLifecycle(
        req.params.id as string, 'approve', req.user!.userId,
      );
      res.json({ success: true, data: preview });
    } catch (error) { next(error); }
  },
);

router.post(
  '/business-accounts/:id/approve',
  authMiddleware,
  validationMiddleware({ params: businessAccountParamsSchema, body: businessLifecycleDecisionSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const id = req.params.id as string;
      const { previewId, reason } = req.body as { previewId: string; reason: string };
      const decision = await businessControlService.applyAccountLifecycleDecision({
        accountId: id, action: 'approve', previewId, actorId: req.user!.userId, reason,
      });
      try {
        await notificationService.createPushNotification({
          userId: decision.owner_user_id,
          type: 'business_update',
          title: 'Business Account Approved',
          body: `Your business account "${decision.company_name}" has been approved. Contracted booking starts after onService publishes your commercial terms and contract.`,
          data: { businessAccountId: id },
        });
      } catch (notifyError) {
        logger.warn('Business account approval notification failed', { businessAccountId: id, notifyError });
      }
      const account = await businessService.getBusinessAccountAdmin(id);
      res.json({ success: true, data: businessService.formatBusinessAccount(account) });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/business-accounts/:id/suspend/preview',
  authMiddleware,
  validationMiddleware({ params: businessAccountParamsSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const preview = await businessControlService.previewAccountLifecycle(
        req.params.id as string, 'suspend', req.user!.userId,
      );
      res.json({ success: true, data: preview });
    } catch (error) { next(error); }
  },
);

router.post(
  '/business-accounts/:id/suspend',
  authMiddleware,
  validationMiddleware({ params: businessAccountParamsSchema, body: businessLifecycleDecisionSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const id = req.params.id as string;
      const { previewId, reason } = req.body as { previewId: string; reason: string };
      const decision = await businessControlService.applyAccountLifecycleDecision({
        accountId: id, action: 'suspend', previewId, actorId: req.user!.userId, reason,
      });
      try {
        await notificationService.createPushNotification({
          userId: decision.owner_user_id,
          type: 'business_update',
          title: 'Business Account Suspended',
          body: `Your business account "${decision.company_name}" has been suspended. Existing work remains visible; new company bookings are paused. Contact support if you need help with this decision.`,
          data: { businessAccountId: id },
        });
      } catch (notifyError) {
        logger.warn('Business account suspension notification failed', { businessAccountId: id, notifyError });
      }
      const account = await businessService.getBusinessAccountAdmin(id);
      res.json({ success: true, data: businessService.formatBusinessAccount(account) });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/business-accounts/:id/assign-manager',
  authMiddleware,
  validationMiddleware({ params: businessAccountIdParamsSchema, body: assignBusinessAccountManagerSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const { accountManagerId, reason } = req.body as { accountManagerId: string; reason: string };
      const account = await businessService.assignBusinessAccountManager({
        businessId: req.params.id as string,
        accountManagerId,
        assignedByAdminId: req.user!.userId,
        reason,
      });
      res.json({ success: true, data: businessService.formatBusinessAccount(account) });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/business-accounts/:id/terms/preview',
  authMiddleware,
  validationMiddleware({ params: businessAccountParamsSchema, body: previewBusinessTermsSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const preview = await businessControlService.previewBusinessTerms(
        req.params.id as string,
        req.body as PreviewBusinessTermsInput,
        req.user!.userId,
      );
      res.json({ success: true, data: preview });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/business-accounts/:id/terms/publish',
  authMiddleware,
  validationMiddleware({ params: businessAccountParamsSchema, body: publishBusinessTermsSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const { previewId, reason } = req.body as { previewId: string; reason: string };
      const terms = await businessControlService.publishBusinessTerms({
        accountId: req.params.id as string,
        previewId,
        actorId: req.user!.userId,
        reason,
      });
      res.json({ success: true, data: businessControlService.formatBusinessTerms(terms) });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/business-accounts/:id/terms/current',
  authMiddleware,
  validationMiddleware({ params: businessAccountParamsSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const terms = await businessControlService.getCurrentBusinessTerms(req.params.id as string);
      res.json({ success: true, data: terms });
    } catch (error) { next(error); }
  },
);

router.post(
  '/business-accounts/:id/set-discount',
  authMiddleware,
  validationMiddleware({ params: businessAccountParamsSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      res.status(410).json({
        success: false,
        message: 'Direct discount and credit edits were retired. Preview and publish a versioned business-terms agreement.',
      });
    } catch (error) { next(error); }
  },
);

router.post(
  '/business-accounts/:id/contracts/:contractId/publish/preview',
  authMiddleware,
  validationMiddleware({ params: businessContractParamsSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const preview = await businessControlService.previewContractLifecycle(
        req.params.id as string, req.params.contractId as string, 'publish', req.user!.userId,
      );
      res.json({ success: true, data: preview });
    } catch (error) { next(error); }
  },
);

router.post(
  '/business-accounts/:id/contracts/:contractId/publish',
  authMiddleware,
  validationMiddleware({ params: businessContractParamsSchema, body: publishBusinessContractSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const { previewId, reason } = req.body as { previewId: string; reason: string };
      const contract = await businessControlService.applyContractLifecycleDecision({
        accountId: req.params.id as string,
        contractId: req.params.contractId as string,
        action: 'publish',
        previewId,
        actorId: req.user!.userId,
        reason,
      });
      res.json({ success: true, data: businessService.formatContract(contract) });
    } catch (error) { next(error); }
  },
);

router.post(
  '/business-accounts/:id/contracts/:contractId/cancel/preview',
  authMiddleware,
  validationMiddleware({ params: businessContractParamsSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const preview = await businessControlService.previewContractLifecycle(
        req.params.id as string, req.params.contractId as string, 'cancel', req.user!.userId,
      );
      res.json({ success: true, data: preview });
    } catch (error) { next(error); }
  },
);

router.post(
  '/business-accounts/:id/contracts/:contractId/cancel',
  authMiddleware,
  validationMiddleware({ params: businessContractParamsSchema, body: publishBusinessContractSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const { previewId, reason } = req.body as { previewId: string; reason: string };
      const contract = await businessControlService.applyContractLifecycleDecision({
        accountId: req.params.id as string,
        contractId: req.params.contractId as string,
        action: 'cancel',
        previewId,
        actorId: req.user!.userId,
        reason,
      });
      res.json({ success: true, data: businessService.formatContract(contract) });
    } catch (error) { next(error); }
  },
);

router.post(
  '/invoices/:id/finalize',
  authMiddleware,
  validationMiddleware({ params: businessInvoiceParamsSchema, body: finalizeBusinessInvoiceSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const { expectedVersion, reason } = req.body as { expectedVersion: number; reason: string };
      const invoice = await businessInvoiceControlService.finalizeInvoice({
        invoiceId: req.params.id as string,
        expectedVersion,
        actorId: req.user!.userId,
        reason,
      });
      try {
        await notificationService.createPushNotification({
          userId: invoice.owner_user_id,
          type: 'business_update',
          title: 'Business statement ready',
          body: `Statement ${invoice.invoice_number} for ${formatPHP(Number(invoice.total_amount))} is ready and due ${invoice.due_date}.`,
          data: { invoiceId: invoice.id, invoiceNumber: invoice.invoice_number },
        });
      } catch (notifyError) {
        logger.warn('Business statement finalization notification failed', { invoiceId: invoice.id, notifyError });
      }
      res.json({ success: true, data: invoiceService.formatInvoice(invoice) });
    } catch (error) { next(error); }
  },
);

router.post(
  '/invoices/:id/payments',
  authMiddleware,
  validationMiddleware({ params: businessInvoiceParamsSchema, body: recordBusinessInvoicePaymentSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const result = await businessInvoiceControlService.recordInvoicePayment(
        req.params.id as string,
        req.body as RecordBusinessInvoicePaymentInput,
        req.user!.userId,
      );
      res.status(201).json({
        success: true,
        data: {
          invoice: invoiceService.formatInvoice(result.invoice),
          balance: {
            adjustmentTotal: result.balance.adjustment_total,
            paymentTotal: result.balance.payment_total,
            adjustedTotal: result.balance.adjusted_total,
            balanceDue: result.balance.balance_due,
          },
          paymentId: result.paymentId,
        },
      });
    } catch (error) { next(error); }
  },
);

router.post(
  '/invoices/:id/adjustments',
  authMiddleware,
  validationMiddleware({ params: businessInvoiceParamsSchema, body: recordBusinessInvoiceAdjustmentSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const result = await businessInvoiceControlService.recordInvoiceAdjustment(
        req.params.id as string,
        req.body as RecordBusinessInvoiceAdjustmentInput,
        req.user!.userId,
      );
      res.status(201).json({
        success: true,
        data: {
          invoice: invoiceService.formatInvoice(result.invoice),
          balance: {
            adjustmentTotal: result.balance.adjustment_total,
            paymentTotal: result.balance.payment_total,
            adjustedTotal: result.balance.adjusted_total,
            balanceDue: result.balance.balance_due,
          },
        },
      });
    } catch (error) { next(error); }
  },
);

router.post(
  '/invoices/:id/payments/:paymentId/reverse',
  authMiddleware,
  validationMiddleware({
    params: businessInvoicePaymentParamsSchema,
    body: reverseBusinessInvoicePaymentSchema,
  }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const result = await businessInvoiceControlService.reverseInvoicePayment(
        req.params.id as string,
        req.params.paymentId as string,
        req.body as ReverseBusinessInvoicePaymentInput,
        req.user!.userId,
      );
      res.status(201).json({
        success: true,
        data: {
          invoice: invoiceService.formatInvoice(result.invoice),
          balance: {
            adjustmentTotal: result.balance.adjustment_total,
            paymentTotal: result.balance.payment_total,
            adjustedTotal: result.balance.adjusted_total,
            balanceDue: result.balance.balance_due,
          },
          reversalId: result.reversalId,
        },
      });
    } catch (error) { next(error); }
  },
);

router.post(
  '/invoices/:id/void',
  authMiddleware,
  validationMiddleware({ params: businessInvoiceParamsSchema, body: voidBusinessInvoiceSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const { expectedVersion, reason } = req.body as { expectedVersion: number; reason: string };
      const invoice = await businessInvoiceControlService.voidInvoice({
        invoiceId: req.params.id as string,
        expectedVersion,
        actorId: req.user!.userId,
        reason,
      });
      if (invoice.status === 'void' && invoice.finalized_at) {
        try {
          await notificationService.createPushNotification({
            userId: invoice.owner_user_id,
            type: 'business_update',
            title: 'Business statement voided',
            body: `Statement ${invoice.invoice_number} was voided. A replacement may be issued after review.`,
            data: { invoiceId: invoice.id, invoiceNumber: invoice.invoice_number },
          });
        } catch (notifyError) {
          logger.warn('Business statement void notification failed', { invoiceId: invoice.id, notifyError });
        }
      }
      res.json({ success: true, data: invoiceService.formatInvoice(invoice) });
    } catch (error) { next(error); }
  },
);

router.post(
  '/invoices/:id/mark-paid',
  authMiddleware,
  validationMiddleware({ params: businessInvoiceParamsSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      res.status(410).json({
        success: false,
        message: 'Mark paid was retired. Record amount, method, effective time, unique reference, evidence, and reason instead.',
      });
    } catch (error) { next(error); }
  },
);

router.get(
  '/invoices/:id',
  authMiddleware,
  validationMiddleware({ params: businessInvoiceParamsSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const id = req.params.id as string;
      const [detail, balance, ledger] = await Promise.all([
        invoiceService.getInvoiceDetailAdmin(id),
        businessInvoiceControlService.getInvoiceBalance(id),
        businessInvoiceControlService.getInvoiceLedger(id),
      ]);
      res.json({
        success: true,
        data: {
          invoice: invoiceService.formatInvoice(detail.invoice),
          items: detail.items.map(invoiceService.formatInvoiceItem),
          balance,
          ledger,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

// --- Service Areas ---

router.get(
  '/service-areas',
  authMiddleware,
  validationMiddleware({ query: serviceAreaListQuerySchema }),
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
      requireSuperAdmin(req);
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
        reason: string;
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
  validationMiddleware({ params: serviceAreaIdParamsSchema }),
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
  validationMiddleware({ params: serviceAreaIdParamsSchema, body: updateServiceAreaSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const id = req.params.id as string;
      const { reason, ...updates } = req.body as Record<string, unknown> & { reason: string };

      const area = await serviceAreaService.updateServiceArea(id, updates, req.user!.userId, reason);
      res.json({ success: true, data: serviceAreaService.formatServiceArea(area) });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/service-areas/:id/activate',
  authMiddleware,
  validationMiddleware({ params: serviceAreaIdParamsSchema, body: serviceAreaLifecycleReasonSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const id = req.params.id as string;

      const area = await serviceAreaService.updateServiceArea(
        id,
        { status: 'active' },
        req.user!.userId,
        req.body.reason as string,
      );
      let notifiedCount = 0;
      let notificationWarning: string | null = null;
      try {
        notifiedCount = await serviceAreaService.notifyWaitlist(id);
      } catch (notificationError) {
        notificationWarning = 'The area was activated, but the waitlist notification run could not be completed. Retry it from Service Areas.';
        logger.error('Service area activated but waitlist notification failed', {
          serviceAreaId: id,
          error: notificationError instanceof Error ? notificationError.message : 'Unknown',
        });
      }

      res.json({
        success: true,
        data: serviceAreaService.formatServiceArea(area),
        waitlistNotification: { notifiedCount, warning: notificationWarning },
        message: notificationWarning
          ?? `Service area activated. ${notifiedCount} registered waitlist account${notifiedCount === 1 ? '' : 's'} notified; other entries remain awaiting contact.`,
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/service-areas/:id/pause',
  authMiddleware,
  validationMiddleware({ params: serviceAreaIdParamsSchema, body: serviceAreaLifecycleReasonSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const id = req.params.id as string;

      const area = await serviceAreaService.updateServiceArea(
        id,
        { status: 'paused' },
        req.user!.userId,
        req.body.reason as string,
      );
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
  validationMiddleware({ params: serviceAreaIdParamsSchema, body: serviceAreaLifecycleReasonSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const id = req.params.id as string;

      const area = await serviceAreaService.setDefaultServiceArea(
        id,
        req.user!.userId,
        req.body.reason as string,
      );
      res.json({ success: true, data: serviceAreaService.formatServiceArea(area), message: 'Default service area updated.' });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/service-areas/:id/providers',
  authMiddleware,
  validationMiddleware({ params: serviceAreaIdParamsSchema }),
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
  validationMiddleware({ params: serviceAreaIdParamsSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      // Bug UX-782 — this legacy admin write bypassed the provider's reviewed
      // market/location/radius request and could silently replace matching
      // coverage. Preserve a clear conflict for old clients; the canonical
      // write is the service-area change decision queue.
      throw createAppError(
        'Direct provider assignment is disabled. Review the provider service-area change request instead.',
        409,
      );
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  '/service-areas/:areaId/providers/:providerId',
  authMiddleware,
  validationMiddleware({ params: serviceAreaProviderParamsSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      throw createAppError(
        'Direct provider removal is disabled. Review the provider service-area change request instead.',
        409,
      );
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/service-areas-waitlist',
  authMiddleware,
  validationMiddleware({ query: serviceAreaWaitlistQuerySchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const page = typeof req.query.page === 'number' ? req.query.page : 1;
      const pageSize = typeof req.query.pageSize === 'number' ? req.query.pageSize : 20;
      const city = typeof req.query.city === 'string' ? req.query.city : undefined;
      const notifiedFilter = typeof req.query.notified === 'boolean' ? req.query.notified : undefined;

      const result = await serviceAreaService.getWaitlist(page, pageSize, city, notifiedFilter);
      const revealPersonalData = req.user!.role === 'super_admin';

      res.json({
        success: true,
        data: result.items.map((entry) => serviceAreaService.formatWaitlistEntry(entry, revealPersonalData)),
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
  validationMiddleware({ params: serviceAreaIdParamsSchema, body: serviceAreaLifecycleReasonSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const id = req.params.id as string;
      const notified = await serviceAreaService.notifyWaitlist(id, {
        adminId: req.user!.userId,
        reason: req.body.reason as string,
      });
      res.json({ success: true, data: { notifiedCount: notified } });
    } catch (error) {
      next(error);
    }
  },
);

// --- Pricing-rule draft / preview / publish / retire workflow ---

router.get(
  '/pricing-rules',
  authMiddleware,
  validationMiddleware({ query: pricingRuleListQuerySchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const page = typeof req.query.page === 'number' ? req.query.page : 1;
      const pageSize = typeof req.query.pageSize === 'number' ? req.query.pageSize : 20;
      const type = typeof req.query.type === 'string' ? req.query.type : undefined;
      const status = typeof req.query.status === 'string'
        ? req.query.status as pricingService.PricingRulePublicationStatus
        : undefined;

      const result = await pricingService.listPricingRules({ type, status, page, pageSize });

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
  validationMiddleware({ params: pricingRuleIdParamsSchema }),
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

router.post(
  '/pricing-rules',
  authMiddleware,
  validationMiddleware({ body: createPricingRuleSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const rule = await pricingPublicationService.createPricingRuleDraft(
        req.body as CreatePricingRuleInput,
        req.user!.userId,
      );

      res.status(201).json({ success: true, data: pricingService.formatPricingRule(rule) });
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  '/pricing-rules/:id',
  authMiddleware,
  validationMiddleware({ params: pricingRuleIdParamsSchema, body: updatePricingRuleSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const id = req.params.id as string;
      const rule = await pricingPublicationService.updatePricingRuleDraft(
        id,
        req.body as UpdatePricingRuleInput,
        req.user!.userId,
      );
      res.json({ success: true, data: pricingService.formatPricingRule(rule) });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/pricing-rules/:id/preview',
  authMiddleware,
  validationMiddleware({ params: pricingRuleIdParamsSchema, body: previewPricingRuleSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const id = req.params.id as string;
      const preview = await pricingPublicationService.previewPricingRuleDraft(
        id,
        req.body as PreviewPricingRuleInput,
        req.user!.userId,
      );
      res.json({ success: true, data: preview });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/pricing-rules/:id/publish',
  authMiddleware,
  validationMiddleware({ params: pricingRuleIdParamsSchema, body: publishPricingRuleSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const id = req.params.id as string;
      const rule = await pricingPublicationService.publishPricingRuleDraft(
        id,
        req.body as { previewId: string; reason: string },
        req.user!.userId,
      );
      res.json({ success: true, data: pricingService.formatPricingRule(rule) });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/pricing-rules/:id/retire',
  authMiddleware,
  validationMiddleware({ params: pricingRuleIdParamsSchema, body: retirePricingRuleSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const id = req.params.id as string;
      const rule = await pricingPublicationService.retirePricingRule(
        id,
        req.body as { reason: string },
        req.user!.userId,
      );
      res.json({ success: true, data: pricingService.formatPricingRule(rule) });
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
  validationMiddleware({ query: blockedIpListQuerySchema }),
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
  validationMiddleware(blockIpBodySchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const { ipAddress, reason, expiresInHours } = req.body;

      const blocked = await securityService.blockIp({
        ipAddress,
        reason,
        blockedBy: req.user!.userId,
        expiresInHours,
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

async function unblockIpHandler(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    requireAdmin(req);
    const ipAddress = String(req.params.ipAddress);
    const unblocked = await securityService.unblockIp(
      ipAddress,
      req.user!.userId,
      req.body.reason,
    );

    if (!unblocked) {
      res.status(404).json({
        success: false,
        error: { message: 'Blocked IP not found.', statusCode: 404 },
      });
      return;
    }

    res.json({
      success: true,
      message: 'IP unblocked. Automatic detection can re-evaluate the address while recent failures remain.',
    });
  } catch (error) {
    next(error);
  }
}

router.post(
  '/blocked-ips/:ipAddress/unblock',
  authMiddleware,
  validationMiddleware({ params: blockedIpParamsSchema, body: unblockIpBodySchema }),
  unblockIpHandler,
);

// Backward-compatible verb for any operational client that already used the
// original hidden endpoint. It now requires the same reasoned body.
router.delete(
  '/blocked-ips/:ipAddress',
  authMiddleware,
  validationMiddleware({ params: blockedIpParamsSchema, body: unblockIpBodySchema }),
  unblockIpHandler,
);

router.get(
  '/security-events',
  authMiddleware,
  validationMiddleware({ query: securityEventListQuerySchema }),
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
      await requireAbTestingEnabled();
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
      await requireAbTestingEnabled();
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
      await requireAbTestingEnabled();
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
      await requireAbTestingEnabled();
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
      const sortBy = (typeof req.query.sortBy === 'string' && ['overall', 'rating', 'completion', 'timeliness', 'cancellation', 'response'].includes(req.query.sortBy))
        ? req.query.sortBy as 'overall' | 'rating' | 'completion' | 'timeliness' | 'cancellation' | 'response'
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
      requireSuperAdmin(req);
      throw createAppError(
        'Quality score recomputation is held while E47 resolves the conflicting score definitions.',
        409,
      );
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

// --- Commission Evidence (read-only) ---

router.get(
  '/analytics/commission-evidence',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const evidence = await adminAnalyticsService.getCommissionEvidence();
      res.json({ success: true, data: evidence });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/analytics/commission-optimization',
  authMiddleware,
  async (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      throw createAppError(
        'Automated commission-rate advice is retired under E48. Use /analytics/commission-evidence.',
        410,
      );
    } catch (error) {
      next(error);
    }
  },
);

// --- Audit Log ---
//
// Backed by a UNION ALL across two tables:
//   * audit_log     — selected explicitly recorded system events. The generic
//                     request middleware is not mounted; E37 tracks the gap.
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
  target_user_role: string | null;
  target_provider_id: string | null;
  target_booking_id: string | null;
  target_tax_year: number | null;
  target_tax_quarter: number | null;
  target_tax_month: number | null;
}

router.get(
  '/audit-log',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const parsed = parseAuditTimelineListQuery(req.query as Record<string, unknown>);
      const { page, pageSize } = parsed;
      const offset = (page - 1) * pageSize;

      // Filters are applied to the unioned subquery via an outer
      // WHERE so they hit both source tables consistently.
      const filters: string[] = [];
      const params: unknown[] = [];
      let paramIdx = 1;

      // D34: ordinary operations admins must not receive DPO-owned privacy
      // records through the general timeline, including through exact filters.
      // Super admins retain cross-boundary governance review authority.
      const visibilityClause = generalAuditVisibilityClause(req.user!.role);
      if (visibilityClause) filters.push(visibilityClause);

      if (parsed.userId) {
        filters.push(`combined.user_id = $${paramIdx++}`);
        params.push(parsed.userId);
      }
      if (parsed.action) {
        filters.push(`combined.action ILIKE $${paramIdx++}`);
        params.push(`%${parsed.action}%`);
      }
      if (parsed.entityType) {
        filters.push(`combined.entity_type = $${paramIdx++}`);
        params.push(parsed.entityType);
      }
      if (parsed.entityId) {
        filters.push(`combined.entity_id = $${paramIdx++}`);
        params.push(parsed.entityId);
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
      if (parsed.from) {
        filters.push(`combined.created_at >= ($${paramIdx++}::date AT TIME ZONE 'Asia/Manila')`);
        params.push(parsed.from);
      }
      if (parsed.to) {
        filters.push(`combined.created_at < (($${paramIdx++}::date + INTERVAL '1 day') AT TIME ZONE 'Asia/Manila')`);
        params.push(parsed.to);
      }
      if (parsed.source) {
        filters.push(`combined.source = $${paramIdx++}`);
        params.push(parsed.source);
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
        `SELECT combined.*, u.email AS user_email, u.role AS user_role,
                target_user.role AS target_user_role,
                COALESCE(
                  target_provider.id,
                  CASE WHEN combined.entity_type = 'provider' THEN combined.entity_id END,
                  CASE WHEN combined.entity_type = 'provider_application' THEN (
                    SELECT application_provider.id
                      FROM providers application_provider
                     WHERE application_provider.user_id = combined.entity_id
                     LIMIT 1
                  ) END,
                  CASE WHEN combined.entity_type = 'provider_document' THEN (
                    SELECT document_provider.id
                      FROM provider_documents document
                      JOIN providers document_provider ON document_provider.user_id = document.user_id
                     WHERE document.id = combined.entity_id
                     LIMIT 1
                  ) END,
                  CASE WHEN combined.entity_type = 'provider_certification' THEN (
                    SELECT certification.provider_id
                      FROM provider_certifications certification
                     WHERE certification.id = combined.entity_id
                  ) END,
                  CASE WHEN combined.entity_type = 'provider_staff' THEN (
                    SELECT staff.provider_id
                      FROM provider_staff staff
                     WHERE staff.id = combined.entity_id
                  ) END,
                  CASE WHEN combined.entity_type = 'provider_note' THEN (
                    SELECT note.provider_id
                      FROM provider_admin_notes note
                     WHERE note.id = combined.entity_id
                  ) END,
                  CASE WHEN combined.entity_type = 'review' THEN (
                    SELECT review.provider_id
                      FROM reviews review
                     WHERE review.id = combined.entity_id
                  ) END,
                  CASE WHEN combined.entity_type = 'bir_2307_batch' THEN (
                    SELECT batch.provider_id
                      FROM bir_2307_batches batch
                     WHERE batch.id = combined.entity_id
                  ) END
                ) AS target_provider_id,
                CASE WHEN combined.entity_type = 'official_receipt' THEN (
                  SELECT receipt.booking_id
                    FROM official_receipts receipt
                   WHERE receipt.id = combined.entity_id
                ) END AS target_booking_id,
                CASE
                  WHEN combined.entity_type = 'bir_2307_batch' THEN (
                    SELECT batch.tax_year
                      FROM bir_2307_batches batch
                     WHERE batch.id = combined.entity_id
                  )
                  WHEN combined.entity_type = 'vat_report' THEN (
                    SELECT report.period_year
                      FROM vat_monthly_reports report
                     WHERE report.id = combined.entity_id
                  )
                END AS target_tax_year,
                CASE WHEN combined.entity_type = 'bir_2307_batch' THEN (
                  SELECT batch.tax_quarter
                    FROM bir_2307_batches batch
                   WHERE batch.id = combined.entity_id
                ) END AS target_tax_quarter,
                CASE WHEN combined.entity_type = 'vat_report' THEN (
                  SELECT report.period_month
                    FROM vat_monthly_reports report
                   WHERE report.id = combined.entity_id
                ) END AS target_tax_month
           FROM (${baseRelation}) combined
           LEFT JOIN users u ON u.id = combined.user_id
           LEFT JOIN users target_user
             ON combined.entity_type IN ('user', 'users')
            AND target_user.id = combined.entity_id
           LEFT JOIN providers target_provider
             ON target_provider.user_id = target_user.id
         ${whereClause}
         ORDER BY combined.created_at DESC, combined.id DESC
         LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
        [...params, pageSize, offset],
      );

      res.json({
        success: true,
        data: dataResult.rows.map((r) => ({
          id: r.id,
          source: r.source,
          userId: r.user_id,
          // The timeline is an operations index, not a bulk PII reveal.
          // Contact, network data, free-text reasons, and nested JSON remain
          // masked for every role. Operators use the audited 360 reveal path
          // when raw contact is genuinely required for one record.
          userEmail: r.user_email ? maskEmail(r.user_email) : null,
          userRole: r.user_role,
          // Keep the account being acted upon separate from the operator who
          // performed the action. A super-admin force-logging-out a customer
          // must lead support to Customer 360, not the staff directory.
          targetUserRole: r.target_user_role,
          targetProviderId: r.target_provider_id,
          targetBookingId: r.target_booking_id,
          targetTaxYear: r.target_tax_year,
          targetTaxQuarter: r.target_tax_quarter,
          targetTaxMonth: r.target_tax_month,
          action: r.action,
          entityType: r.entity_type,
          entityId: r.entity_id,
          oldValues: r.old_values === null ? null : maskPiiInObject(r.old_values as Json),
          newValues: r.new_values === null ? null : maskPiiInObject(r.new_values as Json),
          ipAddress: r.ip_address ? maskIp(r.ip_address) : null,
          userAgent: r.user_agent ? maskUserAgent(r.user_agent) : null,
          reason: r.reason ? maskPiiInString(r.reason) : null,
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
