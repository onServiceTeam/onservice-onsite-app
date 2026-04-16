import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { validationMiddleware } from '../middleware/validation.middleware';
import { withdrawalSchema } from '../validators/wallet.validators';
import * as walletService from '../services/wallet.service';
import * as paymentService from '../services/payment.service';
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
  '/top-up',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const { amount, paymentMethod } = req.body as { amount: number; paymentMethod: string };

      if (!amount || typeof amount !== 'number' || amount < 10000) {
        throw createAppError('Minimum top-up amount is ₱100.00.', 400);
      }
      if (amount > 5000000) {
        throw createAppError('Maximum top-up amount is ₱50,000.00 per transaction.', 400);
      }

      const validMethods = ['gcash', 'maya', 'card', 'qrph', 'bank_transfer'];
      if (!paymentMethod || !validMethods.includes(paymentMethod)) {
        throw createAppError('Please select a valid payment method (GCash, Maya, Card, QRPH, or Bank Transfer).', 400);
      }

      const topUpId = `topup_${userId}_${Date.now()}`;
      const intent = await paymentService.createPaymentIntent(
        topUpId,
        amount,
        paymentMethod as 'gcash' | 'maya' | 'card' | 'qrph' | 'bank_transfer',
        `Wallet top-up for user ${userId}`,
      );

      logger.info('Wallet top-up intent created', { userId, amount, paymentMethod, intentId: intent.id });

      res.status(201).json({
        success: true,
        data: {
          topUpId,
          amount,
          paymentMethod,
          paymentIntent: paymentService.formatPaymentIntent(intent),
          message: 'Top-up payment intent created. Complete payment to add funds to your wallet.',
        },
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

      const payout = await db.transaction(async (client) => {
        interface WalletBalanceRow { available_balance: number; [key: string]: unknown }
        const walletUpdate = await client.query<WalletBalanceRow>(
          `UPDATE wallets SET available_balance = available_balance - $1, updated_at = NOW()
           WHERE id = $2 AND available_balance >= $1 RETURNING *`,
          [amount, wallet.id],
        );
        if (walletUpdate.rows.length === 0) throw createAppError('Insufficient balance.', 400);
        const updatedWallet = walletUpdate.rows[0]!;

        await client.query(
          `INSERT INTO wallet_transactions (wallet_id, type, amount, balance_after, description)
           VALUES ($1, 'withdrawal', $2, $3, $4)`,
          [wallet.id, -amount, updatedWallet.available_balance, `Withdrawal via ${method} to ${destinationAccount}`],
        );

        const payoutResult = await client.query<PayoutRow>(
          `INSERT INTO payouts (provider_id, wallet_id, amount, method, destination_account)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [providerId, wallet.id, amount, method, destinationAccount],
        );
        return payoutResult;
      });

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

// ─── Payout Schedule Preferences ──────────────────────────

interface PayoutPrefsRow {
  payout_frequency: string;
  payout_min_threshold: number;
  payout_preferred_method: string;
  payout_destination_account: string | null;
}

router.get(
  '/payout-preferences',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (req.user!.role !== 'provider') {
        throw createAppError('Only providers can access payout preferences.', 403);
      }

      const result = await db.query<PayoutPrefsRow>(
        `SELECT payout_frequency, payout_min_threshold, payout_preferred_method, payout_destination_account
         FROM providers WHERE user_id = $1`,
        [req.user!.userId],
      );

      if (result.rows.length === 0) throw createAppError('Provider not found.', 404);
      const p = result.rows[0]!;

      res.json({
        success: true,
        data: {
          frequency: p.payout_frequency,
          minThreshold: p.payout_min_threshold,
          preferredMethod: p.payout_preferred_method,
          destinationAccount: p.payout_destination_account,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.put(
  '/payout-preferences',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (req.user!.role !== 'provider') {
        throw createAppError('Only providers can update payout preferences.', 403);
      }

      const { frequency, minThreshold, preferredMethod, destinationAccount } = req.body;

      const validFrequencies = ['manual', 'daily', 'weekly', 'biweekly', 'monthly'];
      if (frequency && !validFrequencies.includes(frequency)) {
        throw createAppError('Invalid payout frequency.', 400);
      }
      const validMethods = ['gcash', 'maya', 'bank_transfer'];
      if (preferredMethod && !validMethods.includes(preferredMethod)) {
        throw createAppError('Invalid payout method.', 400);
      }
      if (minThreshold !== undefined && (typeof minThreshold !== 'number' || minThreshold < 10000)) {
        throw createAppError('Minimum threshold must be at least ₱100.00.', 400);
      }

      const result = await db.query<PayoutPrefsRow>(
        `UPDATE providers
         SET payout_frequency = COALESCE($1, payout_frequency),
             payout_min_threshold = COALESCE($2, payout_min_threshold),
             payout_preferred_method = COALESCE($3, payout_preferred_method),
             payout_destination_account = COALESCE($4, payout_destination_account),
             updated_at = NOW()
         WHERE user_id = $5
         RETURNING payout_frequency, payout_min_threshold, payout_preferred_method, payout_destination_account`,
        [frequency ?? null, minThreshold ?? null, preferredMethod ?? null, destinationAccount ?? null, req.user!.userId],
      );

      if (result.rows.length === 0) throw createAppError('Provider not found.', 404);
      const p = result.rows[0]!;

      logger.info('Payout preferences updated', { userId: req.user!.userId, frequency: p.payout_frequency });

      res.json({
        success: true,
        data: {
          frequency: p.payout_frequency,
          minThreshold: p.payout_min_threshold,
          preferredMethod: p.payout_preferred_method,
          destinationAccount: p.payout_destination_account,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

function formatPayout(p: PayoutRow): Record<string, unknown> {
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
