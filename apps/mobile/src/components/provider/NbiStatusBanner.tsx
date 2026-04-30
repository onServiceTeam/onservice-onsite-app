/**
 * Phase 14 Dispatch 12 — Pattern P1: NBI lifecycle global banner.
 *
 * Mounted in `apps/mobile/app/(provider-tabs)/_layout.tsx` so the banner
 * appears on every provider tab. The banner reads the existing
 * `/api/v1/provider/nbi-status` endpoint and renders one of three states:
 *
 *   - hidden (>30 days until expiry)
 *   - warning (≤30 days until expiry)
 *   - error (expired)
 *
 * Tap on the banner navigates to provider account-management where the
 * provider can re-upload NBI clearance.
 *
 * Bug 1234 chain (certification expiry tracking) extends the same shape
 * to optional certifications; NBI is the only mandatory document so it
 * gets the global slot.
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { colors, spacing, borderRadius, typography } from '@/config/theme';

interface NbiStatusResponse {
  data: {
    status: 'valid' | 'expiring' | 'expired' | 'missing';
    expiresAt: string | null;
  };
}

function differenceInDays(future: Date, now: Date): number {
  return Math.floor((future.getTime() - now.getTime()) / 86_400_000);
}

export interface NbiStatusBannerProps {
  onTap?: () => void;
  fetcher?: () => Promise<NbiStatusResponse>;
}

export function NbiStatusBanner({
  onTap,
  fetcher,
}: NbiStatusBannerProps): React.ReactElement | null {
  const query = useQuery<NbiStatusResponse>({
    queryKey: ['provider-nbi-status'],
    queryFn: fetcher ?? (async () => {
      const apiModule = await import('@/services/api');
      const res = await apiModule.default.get<NbiStatusResponse['data']>('/api/v1/provider/nbi-status');
      return { data: res.data };
    }),
    staleTime: 15 * 60_000,
  });

  if (!query.data) return null;

  const { status, expiresAt } = query.data.data;
  const expiry = expiresAt ? new Date(expiresAt) : null;
  const daysUntil = expiry ? differenceInDays(expiry, new Date()) : null;

  const isExpired = status === 'expired' || (daysUntil !== null && daysUntil < 0);
  const isExpiring = !isExpired && daysUntil !== null && daysUntil <= 30;
  const isMissing = status === 'missing';

  if (!isExpired && !isExpiring && !isMissing) return null;

  const variant = isExpired || isMissing ? 'error' : 'warning';
  const title = isExpired
    ? 'NBI clearance expired'
    : isMissing
      ? 'NBI clearance missing'
      : `NBI clearance expires in ${daysUntil} days`;
  const body = isExpired
    ? 'You will not be matched to new jobs until your NBI clearance is renewed.'
    : isMissing
      ? 'Upload your NBI clearance to continue accepting jobs.'
      : 'Renew now to avoid pause in matching.';

  return (
    <Pressable
      onPress={onTap}
      accessibilityRole="alert"
      accessibilityLabel={`${title}. ${body}`}
      testID={isExpired ? 'nbi-banner-expired' : isMissing ? 'nbi-banner-missing' : 'nbi-banner-expiring'}
      style={[styles.banner, variant === 'error' ? styles.error : styles.warning]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, variant === 'error' ? styles.errorText : styles.warningText]}>
          {title}
        </Text>
        <Text style={[styles.body, variant === 'error' ? styles.errorText : styles.warningText]}>
          {body}
        </Text>
      </View>
      <Text style={[styles.action, variant === 'error' ? styles.errorText : styles.warningText]}>
        Update now
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    borderRadius: borderRadius.sm,
    margin: spacing.sm,
  },
  warning: { backgroundColor: colors.warningLight },
  error: { backgroundColor: colors.errorLight },
  title: { ...typography.bodySmall, fontWeight: '700' },
  body: { ...typography.caption },
  warningText: { color: colors.warningDark },
  errorText: { color: colors.error },
  action: { ...typography.bodySmall, fontWeight: '700', textDecorationLine: 'underline' },
});

export default NbiStatusBanner;
