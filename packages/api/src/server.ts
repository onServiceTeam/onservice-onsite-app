import dotenv from 'dotenv';
dotenv.config({ path: '../../.env' });

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import { errorMiddleware } from './middleware/error.middleware';
import { rateLimitMiddleware } from './middleware/rate-limit.middleware';
import { logger } from './utils/logger';
import { platformConfig } from './config/platform.config';

import authRoutes from './routes/auth.routes';
import bookingRoutes from './routes/booking.routes';
import catalogRoutes from './routes/catalog.routes';
import providerRoutes from './routes/provider.routes';
import reviewRoutes from './routes/review.routes';
import disputeRoutes from './routes/dispute.routes';
import walletRoutes from './routes/wallet.routes';
import paymentRoutes from './routes/payment.routes';
import adminRoutes from './routes/admin.routes';
import webhookRoutes from './routes/webhook.routes';
import notificationRoutes from './routes/notification.routes';
import notificationTemplateRoutes from './routes/notification-template.routes';
import messagingRoutes from './routes/messaging.routes';
import addressRoutes from './routes/address.routes';
import referralRoutes from './routes/referral.routes';
import recurringRoutes from './routes/recurring.routes';
import sukiRoutes from './routes/suki.routes';
import uploadRoutes from './routes/upload.routes';
import serviceAreaRoutes from './routes/service-area.routes';
import businessRoutes from './routes/business.routes';
import payoutRoutes from './routes/payout.routes';
import tipRoutes from './routes/tip.routes';
import securityRoutes from './routes/security.routes';
import accountRoutes from './routes/account.routes';
import promotionRoutes from './routes/promotion.routes';

const app = express();
const PORT = process.env.PORT || 3001;

// --- Security Middleware ---
app.use(helmet());
app.use(cors({
  origin: process.env.APP_URL || 'http://localhost:3000',
  credentials: true,
}));

// --- Body Parsing (capture raw body for webhook signature verification) ---
app.use(express.json({
  limit: '10mb',
  verify: (req, _res, buf) => {
    (req as express.Request & { rawBody?: string }).rawBody = buf.toString();
  },
}));
app.use(express.urlencoded({ extended: true }));

// --- Compression ---
app.use(compression());

// --- Request Logging ---
app.use(morgan('combined', {
  stream: { write: (message: string): void => { logger.info(message.trim()); } },
}));

// --- Rate Limiting ---
app.use(rateLimitMiddleware);

// --- Health Check ---
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: platformConfig.appVersion,
  });
});

// --- Webhooks (must be before JSON parsing but we need raw body) ---
app.use('/api/v1/webhooks', webhookRoutes);

// --- API Routes ---
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/bookings', bookingRoutes);
app.use('/api/v1/catalog', catalogRoutes);
app.use('/api/v1/providers', providerRoutes);
app.use('/api/v1/reviews', reviewRoutes);
app.use('/api/v1/disputes', disputeRoutes);
app.use('/api/v1/wallet', walletRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/notification-templates', notificationTemplateRoutes);
app.use('/api/v1/messaging', messagingRoutes);
app.use('/api/v1/addresses', addressRoutes);
app.use('/api/v1/referrals', referralRoutes);
app.use('/api/v1/recurring', recurringRoutes);
app.use('/api/v1/suki', sukiRoutes);
app.use('/api/v1/uploads', uploadRoutes);
app.use('/api/v1/service-areas', serviceAreaRoutes);
app.use('/api/v1/business', businessRoutes);
app.use('/api/v1/payouts', payoutRoutes);
app.use('/api/v1/tips', tipRoutes);
app.use('/api/v1/security', securityRoutes);
app.use('/api/v1/account', accountRoutes);
app.use('/api/v1/promotions', promotionRoutes);

// --- Global Error Handler (must be last) ---
app.use(errorMiddleware);

// --- Start Server ---
app.listen(PORT, () => {
  logger.info(`onService API server running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;
