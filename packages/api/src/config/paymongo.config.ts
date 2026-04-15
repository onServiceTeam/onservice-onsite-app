/**
 * PayMongo configuration for Philippine payment processing.
 * NEVER log or expose secret keys.
 */
export const paymongoConfig = {
  publicKey: process.env.PAYMONGO_PUBLIC_KEY || '',
  secretKey: process.env.PAYMONGO_SECRET_KEY || '',
  webhookSecret: process.env.PAYMONGO_WEBHOOK_SECRET || '',
  currency: 'PHP' as const,
  supportedMethods: ['gcash', 'maya', 'card', 'qrph'] as const,
};

export type PaymentMethod = (typeof paymongoConfig.supportedMethods)[number];
