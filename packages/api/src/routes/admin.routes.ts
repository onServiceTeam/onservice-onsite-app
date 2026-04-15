import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { validationMiddleware } from '../middleware/validation.middleware';
import { suspendProviderSchema, changeProviderTierSchema } from '../validators/admin.validators';
import * as adminService from '../services/admin.service';
import { createAppError } from '../middleware/error.middleware';
import { db } from '../models/db';
import * as notificationService from '../services/notification.service';
import * as invoiceService from '../services/invoice.service';
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

      const { providers, total } = await adminService.listProviders({ status, tier, search, page, pageSize });

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
      const adminId = typeof req.query.adminId === 'string' ? req.query.adminId : undefined;
      const actionType = typeof req.query.actionType === 'string' ? req.query.actionType : undefined;

      const { actions, total } = await adminService.getAdminActions({ adminId, actionType, page, pageSize });

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
      const result = await db.query(
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
      const data = result.rows.map((r: Record<string, unknown>) => ({
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

      const result = await db.query(
        `UPDATE recurring_bookings
         SET status = 'cancelled', cancelled_at = NOW(), cancellation_reason = $1, updated_at = NOW()
         WHERE id = $2 AND status IN ('active', 'paused')`,
        [reason ?? 'Cancelled by admin', id],
      );

      if ((result.rowCount ?? 0) === 0) {
        res.status(404).json({ success: false, message: 'Recurring booking not found or already cancelled.' });
        return;
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
      const result = await db.query(
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

      const data = result.rows.map((r: Record<string, unknown>) => ({
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
        await notificationService.createNotification({
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

router.post(
  '/service-areas',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const {
        name, city, province, region,
        zipCodes, centerLat, centerLng, radiusKm,
        minProvidersToLaunch, launchDate, settings,
      } = req.body as {
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

      if (!name || !city || !province || !region || centerLat === undefined || centerLng === undefined) {
        res.status(400).json({ success: false, message: 'name, city, province, region, centerLat, and centerLng are required.' });
        return;
      }

      if (Number.isNaN(Number(centerLat)) || Number.isNaN(Number(centerLng))) {
        res.status(400).json({ success: false, message: 'centerLat and centerLng must be valid numbers.' });
        return;
      }

      if (Number(centerLat) < -90 || Number(centerLat) > 90 || Number(centerLng) < -180 || Number(centerLng) > 180) {
        res.status(400).json({ success: false, message: 'Invalid coordinates. Latitude must be -90 to 90, longitude -180 to 180.' });
        return;
      }

      const area = await serviceAreaService.createServiceArea({
        name, city, province, region,
        zipCodes, centerLat, centerLng, radiusKm,
        minProvidersToLaunch, launchDate, settings,
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

router.post(
  '/pricing-rules',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const { name, type, multiplier, rushHoursThreshold, holidayDate,
              peakStartTime, peakEndTime, peakDaysOfWeek,
              categoryId, serviceAreaId, priority, platformSurgeShare, description } = req.body as Record<string, unknown>;

      if (!name || typeof name !== 'string') throw createAppError('name is required.', 400);
      if (!type || !['rush', 'holiday', 'peak_hours'].includes(type as string)) {
        throw createAppError('type must be rush, holiday, or peak_hours.', 400);
      }
      if (!multiplier || typeof multiplier !== 'number' || multiplier < 1.0 || multiplier > 5.0) {
        throw createAppError('multiplier must be a number between 1.0 and 5.0.', 400);
      }

      const rule = await pricingService.createPricingRule({
        name: name as string,
        type: type as 'rush' | 'holiday' | 'peak_hours',
        multiplier: multiplier as number,
        rushHoursThreshold: rushHoursThreshold as number | undefined,
        holidayDate: holidayDate as string | undefined,
        peakStartTime: peakStartTime as string | undefined,
        peakEndTime: peakEndTime as string | undefined,
        peakDaysOfWeek: peakDaysOfWeek as number[] | undefined,
        categoryId: categoryId as string | undefined,
        serviceAreaId: serviceAreaId as string | undefined,
        priority: priority as number | undefined,
        platformSurgeShare: platformSurgeShare as number | undefined,
        description: description as string | undefined,
      });

      res.status(201).json({ success: true, data: pricingService.formatPricingRule(rule) });
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  '/pricing-rules/:id',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const id = req.params.id as string;
      const rule = await pricingService.updatePricingRule(id, req.body);
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
      const rule = await pricingService.togglePricingRule(id, isActive);
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
      await pricingService.deletePricingRule(id);
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
      const result = await adminAnalyticsService.getChurnPrediction(page, pageSize, riskLevel);
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

export default router;
