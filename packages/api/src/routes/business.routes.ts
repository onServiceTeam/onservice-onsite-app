import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { createAppError } from '../middleware/error.middleware';
import { validationMiddleware } from '../middleware/validation.middleware';
import * as businessService from '../services/business.service';
import * as invoiceService from '../services/invoice.service';
import * as settingsService from '../services/settings.service';
import * as businessControlService from '../services/business-control.service';
import * as businessInvoiceControlService from '../services/business-invoice-control.service';
import {
  addBusinessMemberSchema,
  businessAccountParamsSchema,
  businessContractParamsSchema,
  businessInvoiceParamsSchema,
  businessMemberParamsSchema,
  businessPaginationQuerySchema,
  createBusinessAccountSchema,
  createBusinessContractSchema,
  removeBusinessMemberSchema,
  transferBusinessOwnershipSchema,
  updateBusinessAccountSchema,
} from '../validators/business.validators';

const router = Router();

function requireCustomer(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): void {
  // BUG-SEC-029: these routes are the customer enterprise workspace. Without
  // a role boundary, providers, provider staff, and internal operators could
  // create customer-owned business records under their own user identities.
  if (req.user?.role !== 'customer') {
    next(createAppError('Customer access required.', 403));
    return;
  }
  next();
}

router.use(authMiddleware, requireCustomer);

function getParamId(req: AuthenticatedRequest, param = 'id'): string {
  const id = req.params[param];
  if (typeof id !== 'string' || !id) {
    throw createAppError(`${param} is required.`, 400);
  }
  return id;
}

router.post(
  '/',
  validationMiddleware({ body: createBusinessAccountSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const {
        companyName, businessType, registrationNumber, taxId,
        billingAddress, barangay, city, province,
        contactPerson, contactEmail, contactPhone,
        paymentTerms, notes,
      } = req.body as {
        companyName: string;
        businessType: string;
        registrationNumber?: string;
        taxId?: string;
        billingAddress: string;
        barangay: string;
        city: string;
        province: string;
        contactPerson: string;
        contactEmail: string;
        contactPhone: string;
        paymentTerms?: string;
        notes?: string;
      };

      if (!companyName || !businessType || !billingAddress || !barangay || !city || !province || !contactPerson || !contactEmail || !contactPhone) {
        throw createAppError('Missing required fields.', 400);
      }

      // MED-N165 reads the configured registries. E58 now keeps both rows
      // read-only because the database and due-date logic still enforce the
      // current literals; the fallbacks preserve availability during a
      // settings outage without pretending a new value is deploy-free.
      let validTypes: string[];
      try {
        validTypes = await settingsService.getSettingArray('business_account_types');
      } catch {
        validTypes = ['office', 'condo_management', 'restaurant', 'hotel', 'retail', 'school', 'hospital', 'other'];
      }
      if (!validTypes.includes(businessType)) {
        throw createAppError(`Invalid business type. Must be one of: ${validTypes.join(', ')}`, 400);
      }

      if (paymentTerms) {
        let validTerms: string[];
        try {
          validTerms = await settingsService.getSettingArray('business_payment_terms');
        } catch {
          validTerms = ['net_15', 'net_30', 'net_60'];
        }
        if (!validTerms.includes(paymentTerms)) {
          throw createAppError(`Invalid payment terms. Must be one of: ${validTerms.join(', ')}`, 400);
        }
      }

      const account = await businessService.createBusinessAccount({
        companyName, businessType, registrationNumber, taxId,
        billingAddress, barangay, city, province,
        contactPerson, contactEmail, contactPhone,
        ownerUserId: userId, paymentTerms, notes,
      });
      const memberAccount = await businessService.getBusinessAccount(account.id, userId);

      res.status(201).json({
        success: true,
        data: businessService.formatBusinessAccountForMember(memberAccount),
      });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/',
  validationMiddleware({ query: businessPaginationQuerySchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));

      const result = await businessService.getUserBusinessAccounts(userId, page, pageSize);

      res.json({
        success: true,
        data: result.items.map(businessService.formatBusinessAccountForMember),
        pagination: { page, pageSize, total: result.total, totalPages: Math.ceil(result.total / pageSize) },
      });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/:id',
  validationMiddleware({ params: businessAccountParamsSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const businessId = getParamId(req);
      const userId = req.user!.userId;
      const account = await businessService.getBusinessAccount(businessId, userId);

      res.json({
        success: true,
        data: businessService.formatBusinessAccountForMember(account),
      });
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/:id',
  validationMiddleware({ params: businessAccountParamsSchema, body: updateBusinessAccountSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const businessId = getParamId(req);
      const userId = req.user!.userId;
      const updates = req.body as Partial<{
        companyName: string; businessType: string; registrationNumber: string;
        taxId: string; billingAddress: string; barangay: string; city: string;
        province: string; contactPerson: string; contactEmail: string;
        contactPhone: string; notes: string;
      }>;

      if (updates.businessType) {
        let validTypes: string[];
        try {
          validTypes = await settingsService.getSettingArray('business_account_types');
        } catch {
          validTypes = ['office', 'condo_management', 'restaurant', 'hotel', 'retail', 'school', 'hospital', 'other'];
        }
        if (!validTypes.includes(updates.businessType)) {
          throw createAppError(`Invalid business type. Must be one of: ${validTypes.join(', ')}`, 400);
        }
      }

      await businessService.updateBusinessAccount(businessId, userId, updates);
      const account = await businessService.getBusinessAccount(businessId, userId);

      res.json({
        success: true,
        data: businessService.formatBusinessAccountForMember(account),
      });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/:id/terms/current',
  validationMiddleware({ params: businessAccountParamsSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const businessId = getParamId(req);
      const terms = await businessControlService.getCurrentBusinessTermsForMember(
        businessId,
        req.user!.userId,
      );
      res.json({ success: true, data: terms });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/:id/members',
  validationMiddleware({ params: businessAccountParamsSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const businessId = getParamId(req);
      const userId = req.user!.userId;
      const members = await businessService.getMembers(businessId, userId);

      res.json({
        success: true,
        data: members.map(businessService.formatMember),
      });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/:id/members',
  validationMiddleware({ params: businessAccountParamsSchema, body: addBusinessMemberSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const businessId = getParamId(req);
      const userId = req.user!.userId;
      const { targetUserId, role, canBook, canApprove, canViewInvoices } = req.body as {
        targetUserId: string;
        role: string;
        canBook?: boolean;
        canApprove?: boolean;
        canViewInvoices?: boolean;
      };

      if (!targetUserId || !role) {
        throw createAppError('targetUserId and role are required.', 400);
      }

      if (!['manager', 'member'].includes(role)) {
        throw createAppError('Invalid role. Add members as manager or member; use ownership transfer to change the owner.', 400);
      }

      const member = await businessService.addMember(
        businessId, userId, targetUserId, role,
        { canBook, canApprove, canViewInvoices },
      );

      res.status(201).json({
        success: true,
        data: businessService.formatMember(member),
      });
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/:id/members/:userId',
  validationMiddleware({ params: businessMemberParamsSchema, body: removeBusinessMemberSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const businessId = getParamId(req);
      const targetUserId = getParamId(req, 'userId');
      const requesterId = req.user!.userId;
      const reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined;

      await businessService.removeMember(businessId, requesterId, targetUserId, reason);

      res.json({ success: true, message: 'Member removed.' });
    } catch (err) {
      next(err);
    }
  },
);

// Phase 14 Dispatch 06 — Bug 106: ownership transfer endpoint.
// Body: { newOwnerUserId: string, reason?: string }. Only the current owner
// (verified inside the service) can call this.
router.post(
  '/:id/transfer-ownership',
  validationMiddleware({ params: businessAccountParamsSchema, body: transferBusinessOwnershipSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const businessId = getParamId(req);
      const requesterId = req.user!.userId;
      const newOwnerUserId = typeof req.body?.newOwnerUserId === 'string' ? req.body.newOwnerUserId : '';
      if (!newOwnerUserId) {
        res.status(400).json({ success: false, message: 'newOwnerUserId is required.' });
        return;
      }
      const reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined;

      await businessService.transferOwnership(businessId, requesterId, newOwnerUserId, reason);

      res.json({ success: true, message: 'Ownership transferred.' });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/:id/contracts',
  validationMiddleware({ params: businessAccountParamsSchema, query: businessPaginationQuerySchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const businessId = getParamId(req);
      const userId = req.user!.userId;
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));

      const result = await businessService.getContracts(businessId, userId, page, pageSize);

      res.json({
        success: true,
        data: result.items.map(businessService.formatContract),
        pagination: { page, pageSize, total: result.total, totalPages: Math.ceil(result.total / pageSize) },
      });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/:id/contracts',
  validationMiddleware({ params: businessAccountParamsSchema, body: createBusinessContractSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const businessId = getParamId(req);
      const userId = req.user!.userId;
      const {
        categoryId, subcategoryId, providerId,
        contractType, frequency, agreedRate,
        discountPercentage, estimatedMonthlyValue,
        startDate, endDate, autoRenew, terms,
      } = req.body as {
        categoryId: string;
        subcategoryId?: string;
        providerId?: string;
        contractType: 'recurring' | 'on_demand';
        frequency?: string;
        agreedRate: number;
        discountPercentage?: number;
        estimatedMonthlyValue?: number;
        startDate: string;
        endDate?: string;
        autoRenew?: boolean;
        terms?: string;
      };

      if (!categoryId || !contractType || !agreedRate || !startDate) {
        throw createAppError('categoryId, contractType, agreedRate, and startDate are required.', 400);
      }

      const contract = await businessService.createContract({
        businessAccountId: businessId, categoryId, subcategoryId, providerId,
        contractType, frequency, agreedRate,
        discountPercentage, estimatedMonthlyValue,
        startDate, endDate, autoRenew, terms,
      }, userId);

      res.status(201).json({
        success: true,
        data: businessService.formatContract(contract),
      });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/:id/contracts/:contractId/activate',
  validationMiddleware({ params: businessContractParamsSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const contractId = getParamId(req, 'contractId');
      const userId = req.user!.userId;

      const contract = await businessService.updateContractStatus(contractId, userId, 'active');

      res.json({
        success: true,
        data: businessService.formatContract(contract),
      });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/:id/contracts/:contractId/cancel',
  validationMiddleware({ params: businessContractParamsSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const contractId = getParamId(req, 'contractId');
      const userId = req.user!.userId;

      const contract = await businessService.updateContractStatus(contractId, userId, 'cancelled');

      res.json({
        success: true,
        data: businessService.formatContract(contract),
      });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/:id/invoices',
  validationMiddleware({ params: businessAccountParamsSchema, query: businessPaginationQuerySchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const businessId = getParamId(req);
      const userId = req.user!.userId;
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));

      const result = await invoiceService.getInvoices(businessId, userId, page, pageSize);

      res.json({
        success: true,
        data: result.items.map(invoiceService.formatInvoice),
        pagination: { page, pageSize, total: result.total, totalPages: Math.ceil(result.total / pageSize) },
      });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/:id/invoices/:invoiceId',
  validationMiddleware({ params: businessInvoiceParamsSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const invoiceId = getParamId(req, 'invoiceId');
      const businessId = getParamId(req);
      const userId = req.user!.userId;

      const { invoice, items } = await invoiceService.getInvoiceDetail(businessId, invoiceId, userId);
      const [balance, ledger] = await Promise.all([
        businessInvoiceControlService.getInvoiceBalance(invoiceId),
        businessInvoiceControlService.getInvoiceCustomerLedger(invoiceId),
      ]);

      res.json({
        success: true,
        data: {
          ...invoiceService.formatInvoice(invoice),
          items: items.map(invoiceService.formatInvoiceItem),
          balance,
          ledger,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
