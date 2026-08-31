import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { validationMiddleware } from '../middleware/validation.middleware';
import { withdrawalSchema, updatePayoutPreferencesSchema } from '../validators/wallet.validators';
import * as walletService from '../services/wallet.service';
import * as paymentService from '../services/payment.service';
import * as payoutService from '../services/payout.service';
import { createAppError } from '../middleware/error.middleware';
import { platformConfig } from '../config/platform.config';
import { formatPHP } from '../utils/currency';
import { db } from '../models/db';
import { logger } from '../utils/logger';
import { assertExternalPaymentAuthorizationEnabled } from '../services/external-payment-hold.service';

const router = Router();

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
      const group = (['topup', 'payment', 'refund'] as const).find((value) => value === req.query.group);

      const { transactions, total } = await walletService.getWalletTransactions(wallet.id, page, pageSize, group);
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
      // E14: stop before validation, database writes, or PayMongo calls. The
      // existing hosted redirect is invalid and must not create more stuck
      // top-up intents.
      assertExternalPaymentAuthorizationEnabled();
      const userId = req.user!.userId;
      const { amount, paymentMethod } = req.body as { amount: number; paymentMethod: string };

      if (!amount || typeof amount !== 'number' || amount < platformConfig.minimumTopUpAmount) {
        throw createAppError(`Minimum top-up amount is ${formatPHP(platformConfig.minimumTopUpAmount)}.`, 400);
      }
      if (amount > platformConfig.maximumTopUpAmount) {
        throw createAppError(`Maximum top-up amount is ${formatPHP(platformConfig.maximumTopUpAmount)} per transaction.`, 400);
      }

      const validMethods = ['gcash', 'maya', 'card', 'qrph', 'bank_transfer'];
      if (!paymentMethod || !validMethods.includes(paymentMethod)) {
        throw createAppError('Please select a valid payment method (GCash, Maya, Card, QRPH, or Bank Transfer).', 400);
      }

      const topUpId = `topup_${userId}_${Date.now()}`;
      // MED-N157 fix — pass intentKind='top_up' so the webhook handler
      // routes via metadata field, not bookingId string prefix.
      const intent = await paymentService.createPaymentIntent(
        topUpId,
        amount,
        paymentMethod as 'gcash' | 'maya' | 'card' | 'qrph' | 'bank_transfer',
        `Wallet top-up for user ${userId}`,
        'top_up',
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
      const { amount, method, destinationAccount, accountName, notes } = req.body;

      if (req.user!.role !== 'provider') {
        throw createAppError('Only providers can withdraw funds.', 403);
      }

      // MED-N166 fix: delegate to payoutService.requestPayout instead
      // of running a parallel inline transaction. Pre-fix: this
      // endpoint duplicated the wallet-debit + payouts INSERT and
      // bypassed the AML threshold check (MED-N77), the per-method
      // destination format validation (MED-N78), the pending-payout
      // guard, and the audit pattern. Now everything money-path goes
      // through the one service.
      const payout = await payoutService.requestPayout(userId, {
        amount,
        method,
        destinationAccount,
        accountName,
        notes,
      });

      logger.info('Withdrawal initiated via wallet route', { userId, amount, method });

      res.status(201).json({
        success: true,
        data: payoutService.formatPayout(payout),
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

      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
      const { payouts, total } = await payoutService.getMyPayouts(
        req.user!.userId,
        { page, pageSize },
      );

      res.json({
        success: true,
        data: payouts.map(payoutService.formatPayout),
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
  // BUG-PHASE199-01 fix — pre-fix this route had no Zod validator.
  // destinationAccount was passed through to a VARCHAR(255) column;
  // a 1000-char post returned 5xx string-data-right-truncation. Now
  // updatePayoutPreferencesSchema gates type + length at the route
  // boundary. Same shape as Phase 188 complete-payout fix.
  validationMiddleware(updatePayoutPreferencesSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (req.user!.role !== 'provider') {
        throw createAppError('Only providers can update payout preferences.', 403);
      }

      const { frequency, preferredMethod, destinationAccount } = req.body;

      // UX-072 — saved withdrawal details must pass the same destination
      // validation as a real withdrawal. Require method + account together so
      // changing one side cannot leave a mismatched destination on the account.
      if ((preferredMethod === undefined) !== (destinationAccount === undefined)) {
        throw createAppError('Payout method and destination account must be updated together.', 400);
      }
      if (preferredMethod !== undefined && destinationAccount !== undefined) {
        payoutService.validateDestinationAccount(preferredMethod, destinationAccount);
      }

      const result = await db.query<PayoutPrefsRow>(
        `UPDATE providers
         SET payout_frequency = COALESCE($1, payout_frequency),
             payout_preferred_method = COALESCE($2, payout_preferred_method),
             payout_destination_account = COALESCE($3, payout_destination_account),
             updated_at = NOW()
         WHERE user_id = $4
         RETURNING payout_frequency, payout_min_threshold, payout_preferred_method, payout_destination_account`,
        [frequency ?? null, preferredMethod ?? null, destinationAccount ?? null, req.user!.userId],
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

export default router;
