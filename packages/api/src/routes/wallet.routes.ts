import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { validationMiddleware } from '../middleware/validation.middleware';
import { withdrawalSchema } from '../validators/wallet.validators';
import * as walletService from '../services/wallet.service';
import { createAppError } from '../middleware/error.middleware';
import { platformConfig } from '../config/platform.config';
import { db } from '../models/db';
import { logger } from '../utils/logger';

const router = Router();

interface PayoutRow {
  id: string;
  provider_id: string;
  wallet_id: string;
  amount: string;
  method: string;
  destination_account: string;
  status: string;
  paymongo_transfer_id: string | null;
  failure_reason: string | null;
  created_at: Date;
  completed_at: Date | null;
}

router.get(
  '/',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const role = req.user!.role;
      const walletType = role === 'provider' ? 'provider' : 'customer';
      const wallet = await walletService.getUserWallet(userId, walletType as 'customer' | 'provider');
      res.json({ success: true, data: walletService.formatWallet(wallet) });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/transactions',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const role = req.user!.role;
      const walletType = role === 'provider' ? 'provider' : 'customer';
      const wallet = await walletService.getUserWallet(userId, walletType as 'customer' | 'provider');

      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));

      const { transactions, total } = await walletService.getWalletTransactions(wallet.id, page, pageSize);
      res.json({
        success: true,
        data: transactions.map(walletService.formatTransaction),
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/withdraw',
  authMiddleware,
  validationMiddleware(withdrawalSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const { amount, method, destinationAccount } = req.body;

      if (req.user!.role !== 'provider') {
        throw createAppError('Only providers can withdraw funds.', 403);
      }

      if (amount < platformConfig.minimumWithdrawalAmount) {
        throw createAppError(
          `Minimum withdrawal is ${platformConfig.currencySymbol}${(platformConfig.minimumWithdrawalAmount / 100).toFixed(2)}.`,
          400,
        );
      }

      const wallet = await walletService.getUserWallet(userId, 'provider');
      if (Number(wallet.available_balance) < amount) {
        throw createAppError('Insufficient balance.', 400);
      }

      interface ProviderIdRow { id: string }
      const providerRow = await db.query<ProviderIdRow>(
        `SELECT id FROM providers WHERE user_id = $1`,
        [userId],
      );
      if (providerRow.rows.length === 0) throw createAppError('Provider profile not found.', 404);
      const providerId = providerRow.rows[0]!.id;

      await walletService.debitWallet(
        wallet.id,
        amount,
        'withdrawal',
        `Withdrawal via ${method} to ${destinationAccount}`,
      );

      const payout = await db.query<PayoutRow>(
        `INSERT INTO payouts (provider_id, wallet_id, amount, method, destination_account)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [providerId, wallet.id, amount, method, destinationAccount],
      );

      logger.info('Withdrawal initiated', { userId, amount, method });

      res.status(201).json({
        success: true,
        data: formatPayout(payout.rows[0]!),
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/payouts',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (req.user!.role !== 'provider') {
        throw createAppError('Only providers can view payouts.', 403);
      }

      interface ProviderIdRow { id: string }
      const providerRow = await db.query<ProviderIdRow>(
        `SELECT id FROM providers WHERE user_id = $1`,
        [req.user!.userId],
      );
      if (providerRow.rows.length === 0) throw createAppError('Provider profile not found.', 404);

      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
      const offset = (page - 1) * pageSize;

      interface CountRow { count: string }

      const [countRes, dataRes] = await Promise.all([
        db.query<CountRow>(
          `SELECT COUNT(*)::text as count FROM payouts WHERE provider_id = $1`,
          [providerRow.rows[0]!.id],
        ),
        db.query<PayoutRow>(
          `SELECT * FROM payouts WHERE provider_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
          [providerRow.rows[0]!.id, pageSize, offset],
        ),
      ]);

      const total = Number(countRes.rows[0]?.count ?? 0);

      res.json({
        success: true,
        data: dataRes.rows.map(formatPayout),
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      });
    } catch (error) {
      next(error);
    }
  },
);

function formatPayout(p: PayoutRow) {
  return {
    id: p.id,
    providerId: p.provider_id,
    amount: Number(p.amount),
    method: p.method,
    destinationAccount: p.destination_account,
    status: p.status,
    failureReason: p.failure_reason,
    createdAt: p.created_at,
    completedAt: p.completed_at,
  };
}

export default router;
