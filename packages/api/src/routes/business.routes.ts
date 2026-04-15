import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { createAppError } from '../middleware/error.middleware';
import * as businessService from '../services/business.service';
import * as invoiceService from '../services/invoice.service';

const router = Router();

function getParamId(req: AuthenticatedRequest, param = 'id'): string {
  const id = req.params[param];
  if (typeof id !== 'string' || !id) {
    throw createAppError(`${param} is required.`, 400);
  }
  return id;
}

router.post(
  '/',
  authMiddleware,
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

      const validTypes = ['office', 'condo_management', 'restaurant', 'hotel', 'retail', 'school', 'hospital', 'other'];
      if (!validTypes.includes(businessType)) {
        throw createAppError(`Invalid business type. Must be one of: ${validTypes.join(', ')}`, 400);
      }

      if (paymentTerms && !['net_15', 'net_30', 'net_60'].includes(paymentTerms)) {
        throw createAppError('Invalid payment terms. Must be net_15, net_30, or net_60.', 400);
      }

      const account = await businessService.createBusinessAccount({
        companyName, businessType, registrationNumber, taxId,
        billingAddress, barangay, city, province,
        contactPerson, contactEmail, contactPhone,
        ownerUserId: userId, paymentTerms, notes,
      });

      res.status(201).json({
        success: true,
        data: businessService.formatBusinessAccount(account),
      });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));

      const result = await businessService.getUserBusinessAccounts(userId, page, pageSize);

      res.json({
        success: true,
        data: result.items.map(businessService.formatBusinessAccount),
        pagination: { page, pageSize, total: result.total, totalPages: Math.ceil(result.total / pageSize) },
      });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/:id',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const businessId = getParamId(req);
      const userId = req.user!.userId;
      const account = await businessService.getBusinessAccount(businessId, userId);

      res.json({
        success: true,
        data: businessService.formatBusinessAccount(account),
      });
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/:id',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const businessId = getParamId(req);
      const userId = req.user!.userId;
      const updates = req.body as Partial<{
        companyName: string; businessType: string; registrationNumber: string;
        taxId: string; billingAddress: string; barangay: string; city: string;
        province: string; contactPerson: string; contactEmail: string;
        contactPhone: string; paymentTerms: string; notes: string;
      }>;

      const account = await businessService.updateBusinessAccount(businessId, userId, updates);

      res.json({
        success: true,
        data: businessService.formatBusinessAccount(account),
      });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/:id/members',
  authMiddleware,
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
  authMiddleware,
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

      if (!['owner', 'manager', 'member'].includes(role)) {
        throw createAppError('Invalid role. Must be owner, manager, or member.', 400);
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
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const businessId = getParamId(req);
      const targetUserId = getParamId(req, 'userId');
      const requesterId = req.user!.userId;

      await businessService.removeMember(businessId, requesterId, targetUserId);

      res.json({ success: true, message: 'Member removed.' });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/:id/contracts',
  authMiddleware,
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
  authMiddleware,
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
  authMiddleware,
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
  authMiddleware,
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
  authMiddleware,
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
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const invoiceId = getParamId(req, 'invoiceId');
      const userId = req.user!.userId;

      const { invoice, items } = await invoiceService.getInvoiceDetail(invoiceId, userId);

      res.json({
        success: true,
        data: {
          ...invoiceService.formatInvoice(invoice),
          items: items.map(invoiceService.formatInvoiceItem),
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
