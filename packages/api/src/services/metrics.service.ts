import { db } from '../models/db';
import { logger } from '../utils/logger';

interface MetricSnapshot {
  timestamp: string;
  process: {
    uptime: number;
    memoryUsed: number;
    memoryRss: number;
    cpuUser: number;
    cpuSystem: number;
  };
  business: {
    activeBookings: number;
    completedToday: number;
    cancelledToday: number;
    disputesOpen: number;
    providersOnline: number;
    paymentsToday: number;
    revenueToday: number;
  };
}

export async function collectMetrics(): Promise<MetricSnapshot> {
  const mem = process.memoryUsage();
  const cpu = process.cpuUsage();

  let business = {
    activeBookings: 0,
    completedToday: 0,
    cancelledToday: 0,
    disputesOpen: 0,
    providersOnline: 0,
    paymentsToday: 0,
    revenueToday: 0,
  };

  try {
    const [active, completed, cancelled, disputes, providers, payments] = await Promise.all([
      db.query<{ count: string }>(
        `SELECT COUNT(*)::text as count FROM bookings WHERE status IN ('requested','quoted','matched','payment_pending','paid','provider_en_route','provider_arrived','in_progress')`,
      ),
      db.query<{ count: string }>(
        `SELECT COUNT(*)::text as count FROM bookings WHERE status IN ('completed_by_provider','confirmed','payout_ready','paid_out') AND updated_at >= CURRENT_DATE`,
      ),
      db.query<{ count: string }>(
        `SELECT COUNT(*)::text as count FROM bookings WHERE status LIKE 'cancelled_%' AND updated_at >= CURRENT_DATE`,
      ),
      db.query<{ count: string }>(
        `SELECT COUNT(*)::text as count FROM disputes WHERE status IN ('open','under_review','escalated')`,
      ),
      db.query<{ count: string }>(
        `SELECT COUNT(*)::text as count FROM providers WHERE status = 'approved'`,
      ),
      db.query<{ count: string; total: string }>(
        `SELECT COUNT(*)::text as count, COALESCE(SUM(amount), 0)::text as total
         FROM wallet_transactions WHERE type = 'commission' AND created_at >= CURRENT_DATE`,
      ),
    ]);

    business = {
      activeBookings: Number(active.rows[0]?.count ?? 0),
      completedToday: Number(completed.rows[0]?.count ?? 0),
      cancelledToday: Number(cancelled.rows[0]?.count ?? 0),
      disputesOpen: Number(disputes.rows[0]?.count ?? 0),
      providersOnline: Number(providers.rows[0]?.count ?? 0),
      paymentsToday: Number(payments.rows[0]?.count ?? 0),
      revenueToday: Number(payments.rows[0]?.total ?? 0),
    };
  } catch (err) {
    logger.error('Failed to collect business metrics', { error: err instanceof Error ? err.message : 'Unknown' });
  }

  return {
    timestamp: new Date().toISOString(),
    process: {
      uptime: process.uptime(),
      memoryUsed: mem.heapUsed,
      memoryRss: mem.rss,
      cpuUser: cpu.user,
      cpuSystem: cpu.system,
    },
    business,
  };
}

export function toPrometheusFormat(m: MetricSnapshot): string {
  const lines: string[] = [
    '# HELP onservice_uptime_seconds API process uptime in seconds',
    '# TYPE onservice_uptime_seconds gauge',
    `onservice_uptime_seconds ${m.process.uptime.toFixed(0)}`,
    '',
    '# HELP onservice_memory_heap_bytes Heap memory usage in bytes',
    '# TYPE onservice_memory_heap_bytes gauge',
    `onservice_memory_heap_bytes ${m.process.memoryUsed}`,
    '',
    '# HELP onservice_memory_rss_bytes RSS memory in bytes',
    '# TYPE onservice_memory_rss_bytes gauge',
    `onservice_memory_rss_bytes ${m.process.memoryRss}`,
    '',
    '# HELP onservice_active_bookings Current active bookings',
    '# TYPE onservice_active_bookings gauge',
    `onservice_active_bookings ${m.business.activeBookings}`,
    '',
    '# HELP onservice_completed_today Bookings completed today',
    '# TYPE onservice_completed_today gauge',
    `onservice_completed_today ${m.business.completedToday}`,
    '',
    '# HELP onservice_cancelled_today Bookings cancelled today',
    '# TYPE onservice_cancelled_today gauge',
    `onservice_cancelled_today ${m.business.cancelledToday}`,
    '',
    '# HELP onservice_disputes_open Currently open disputes',
    '# TYPE onservice_disputes_open gauge',
    `onservice_disputes_open ${m.business.disputesOpen}`,
    '',
    '# HELP onservice_providers_active Approved providers',
    '# TYPE onservice_providers_active gauge',
    `onservice_providers_active ${m.business.providersOnline}`,
    '',
    '# HELP onservice_payments_today Payment transactions today',
    '# TYPE onservice_payments_today gauge',
    `onservice_payments_today ${m.business.paymentsToday}`,
    '',
    '# HELP onservice_revenue_today_centavos Platform revenue today in centavos',
    '# TYPE onservice_revenue_today_centavos gauge',
    `onservice_revenue_today_centavos ${m.business.revenueToday}`,
  ];

  return lines.join('\n') + '\n';
}
