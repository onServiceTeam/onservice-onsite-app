import React, { useState } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation } from '@tanstack/react-query';
import { getBookingById } from '@/services/booking.service';
import { sendTip } from '@/services/tip.service';
import { getWalletBalance } from '@/services/payment.service';
import api from '@/services/api';
// A7 — shared UI kit for loading/error states + toast feedback.
import { Button, SkeletonCard, ErrorState } from '@/components/ui';
import { showToast } from '@/lib/toast';
import { formatPHP } from '@/utils/currency';
import { getErrorMessage } from '@/utils/errors';
import { platformConfig } from '@/config/platform.config';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { PartyPopper, Heart } from '@/components/icons';
import { useResponsive } from '@/hooks/useResponsive';
import { Routes } from '@/config/navigation';

const TIP_PERCENTAGES = [10, 15, 20] as const;

export default function TipScreen(): React.ReactElement {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isPhone } = useResponsive();
  const [selectedPercent, setSelectedPercent] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  // BUG-PHASE193-01 fix — pre-fix the tip screen had no message input,
  // but the API (POST /api/v1/tips) accepts an optional `message` (Zod
  // capped at 500 chars; tip.validators.ts), the backend stores it on
  // tips.message, and the provider receives it in the "Tip Received"
  // notification body. The customer had no way to say "thanks for the
  // great service!" — exactly the missing-UX pattern called out by
  // the user ("what is the screen supposed to do... is something
  // missing"). Now: optional message input below custom amount.
  const [message, setMessage] = useState('');

  const { data: booking, isLoading: bookingLoading, isError: bookingError, refetch } = useQuery({
    queryKey: ['booking', bookingId],
    queryFn: () => getBookingById(bookingId ?? ''),
    enabled: !!bookingId,
  });

  // BUG-PHASE47-01 fix — pre-fix the tip screen hardcoded
  // `paymentMethod: 'wallet'` and never showed the wallet balance.
  // If the customer's wallet was empty (or below the tip amount),
  // the API call failed AFTER the user clicked "Send Tip" with a
  // generic "Insufficient balance" error. Now: balance is queried
  // up-front, displayed inline below the preset chips, and the
  // submit button gates on tip ≤ wallet balance.
  const walletQuery = useQuery({
    queryKey: ['wallet'],
    queryFn: getWalletBalance,
    staleTime: 60 * 1000,
  });
  const walletBalance = walletQuery.data?.availableBalance ?? 0;

  // BUG-PHASE196-01 fix — pre-fix the tip screen used servicePrice as
  // the maxTip but ignored the platform-wide tip_max_amount_cents
  // setting. The backend's sendTipSchema caps at TIP_HARD_CAP_CENTAVOS
  // (a separate platform-settings value); a customer entering a tip
  // ≤ servicePrice but > the platform cap got a 400 "Tip amount
  // exceeds platform sanity cap" only AFTER tapping Send. Same UX
  // desync as Phase 145/194 — the UI must match server reality.
  // /api/v1/tips/limits returns { minCents, maxCents }. Now: maxTip is
  // min(servicePrice, platformTipMax) so the input + button gate
  // before the API is even hit.
  const tipLimitsQuery = useQuery({
    queryKey: ['tip-limits'],
    queryFn: async () => {
      const res = await api.get<{ data: { minCents: number; maxCents: number } }>(
        '/api/v1/tips/limits',
      );
      return res.data.data;
    },
    staleTime: 5 * 60 * 1000,
  });
  const platformTipMax = tipLimitsQuery.data?.maxCents ?? 0;

  const servicePrice = booking?.servicePrice ?? 0;

  const tipAmount = ((): number => {
    if (showCustom) {
      const parts = (customAmount || '0').split('.');
      const pesos = parseInt(parts[0] ?? '0', 10) || 0;
      const centavos = parseInt((parts[1] ?? '0').slice(0, 2).padEnd(2, '0'), 10) || 0;
      return pesos * 100 + centavos;
    }
    return selectedPercent ? Math.round(servicePrice * (selectedPercent / 100)) : 0;
  })();

  // BUG-PHASE196-01 fix — maxTip is min(servicePrice, platformTipMax).
  const maxTip = Math.min(servicePrice, platformTipMax);

  const tipMutation = useMutation({
    mutationFn: (amount: number) => sendTip({
      bookingId: bookingId ?? '',
      amount,
      paymentMethod: 'wallet',
      // BUG-PHASE193-01 fix — pass message through to API.
      message: message.trim() || undefined,
    }),
    onSuccess: () => {
      showToast('Thank you! Your tip has been sent to the provider.', 'success');
      router.replace({ pathname: Routes.CUSTOMER.BOOKING_MAKE_RECURRING, params: { bookingId: bookingId ?? '' } });
    },
    onError: (err: unknown) => {
      // Phase D CRIT-69 / K-MED-K04 — canonical error helper.
      showToast(getErrorMessage(err, 'Failed to send tip. Please try again.'), 'error');
    },
  });

  const loading = tipMutation.isPending;

  const handleSendTip = (): void => {
    if (tipAmount <= 0) {
      showToast('Please select or enter a tip amount.', 'warning');
      return;
    }
    if (tipAmount > maxTip) {
      // BUG-PHASE196-01 fix — message reflects which cap is binding.
      const reason = platformTipMax < servicePrice
        ? `platform cap of ${formatPHP(maxTip)}`
        : `${formatPHP(maxTip)} (100% of service price)`;
      showToast(`Maximum tip is ${reason}.`, 'warning');
      return;
    }
    if (tipAmount > walletBalance) {
      showToast(`Your wallet has ${formatPHP(walletBalance)}. Pick a smaller tip; new top-ups are temporarily unavailable.`, 'warning');
      return;
    }
    tipMutation.mutate(tipAmount);
  };

  if (bookingLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + spacing.base }]}>
        <View style={{ padding: spacing.base }}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      </View>
    );
  }

  if (bookingError || !bookingId || !booking) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + spacing.base }]}>
        <ErrorState
          title="Tip unavailable"
          message={bookingId
            ? "We couldn't load this booking. Please check your connection and try again."
            : 'Open the tip form from a completed booking so the correct provider and work record are attached.'}
          onRetry={() => void refetch()}
        />
      </View>
    );
  }

  if (!['completed_by_provider', 'confirmed', 'resolved'].includes(booking.status) || !booking.providerId) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + spacing.base }]}>
        <ErrorState
          title="Tip not available for this booking"
          message="Tips can be sent only after the assigned provider completes the work."
          onRetry={() => router.back()}
        />
      </View>
    );
  }

  if (walletQuery.isPending || tipLimitsQuery.isPending) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + spacing.base }]}>
        <View style={{ padding: spacing.base }}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      </View>
    );
  }

  if (walletQuery.isError || tipLimitsQuery.isError) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + spacing.base }]}>
        <ErrorState
          title="Tip details unavailable"
          message="We could not verify your wallet balance and the current tip limit. Try again before sending money."
          onRetry={() => {
            void walletQuery.refetch();
            void tipLimitsQuery.refetch();
          }}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.base }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        accessibilityLabel="Scrollable tip form"
      >
      <View
        style={[styles.content, !isPhone && styles.contentWide]}
        accessibilityLabel={isPhone ? 'Tip form' : 'Desktop tip workspace'}
      >
        <PartyPopper size={44} color={colors.primary} style={{ marginBottom: spacing.md }} />
        <Text style={styles.title}>Tip Your Provider</Text>
        <Text style={styles.subtitle}>
          Show your appreciation for great service.
        </Text>

        <View style={styles.guaranteeBadge}>
          <Heart size={14} color={colors.success} />
          <Text style={styles.guaranteeText}> 100% goes to the provider, no commission on tips</Text>
        </View>

        <View style={styles.presetRow}>
          {TIP_PERCENTAGES.map((pct) => {
            const amount = Math.round(servicePrice * (pct / 100));
            const isSelected = !showCustom && selectedPercent === pct;
            return (
              <TouchableOpacity
                key={pct}
                style={[styles.presetChip, isSelected && styles.presetChipSelected]}
                onPress={() => {
                  setShowCustom(false);
                  setSelectedPercent(pct);
                  setCustomAmount('');
                }}
                accessibilityRole="button"
                accessibilityLabel={`Tip ${pct} percent, ${formatPHP(amount)}`}
                accessibilityState={{ selected: isSelected }}
              >
                <Text style={[styles.presetPercent, isSelected && styles.presetTextSelected]}>{pct}%</Text>
                <Text style={[styles.presetAmount, isSelected && styles.presetTextSelected]}>
                  {formatPHP(amount)}
                </Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            style={[styles.presetChip, showCustom && styles.presetChipSelected]}
            onPress={() => {
              setShowCustom(true);
              setSelectedPercent(null);
            }}
            accessibilityRole="button"
            accessibilityLabel="Enter a custom tip amount"
            accessibilityState={{ selected: showCustom }}
          >
            <Text style={[styles.presetPercent, showCustom && styles.presetTextSelected]}>Custom</Text>
          </TouchableOpacity>
        </View>

        {showCustom && (
          <View style={styles.customInputRow}>
            <Text style={styles.currencyPrefix}>{platformConfig.currencySymbol}</Text>
            <TextInput
              style={styles.customInput}
              value={customAmount}
              onChangeText={setCustomAmount}
              placeholder="0.00"
              placeholderTextColor={colors.textTertiary}
              keyboardType="decimal-pad"
              autoFocus
              accessibilityLabel="Custom tip amount"
            />
          </View>
        )}

        {tipAmount > 0 && (
          <Text style={styles.tipPreview}>Tip amount: {formatPHP(tipAmount)}</Text>
        )}

        {/* BUG-PHASE193-01 fix — optional message input. The API
            already accepts and forwards this to the provider's
            notification body. Capped at 500 chars (matches the
            tip.validators.ts max). */}
        <View style={styles.messageWrap}>
          <Text style={styles.messageLabel}>Add a message (optional)</Text>
          <TextInput
            style={styles.messageInput}
            value={message}
            onChangeText={setMessage}
            placeholder="Thanks for the great service!"
            placeholderTextColor={colors.textTertiary}
            multiline
            maxLength={500}
            numberOfLines={3}
            textAlignVertical="top"
            accessibilityLabel="Optional tip message"
          />
          {message.length > 0 && (
            <Text style={styles.messageCount}>{message.length}/500</Text>
          )}
        </View>

        {/* BUG-PHASE47-01 — wallet balance + insufficient warning. */}
        <Text style={styles.balanceHint}>
          Wallet balance: {formatPHP(walletBalance)}
        </Text>
        {tipAmount > 0 && tipAmount > walletBalance && (
          <Text style={styles.balanceWarn}>
            Tip exceeds your existing wallet balance. Choose a smaller tip; new top-ups are temporarily unavailable.
          </Text>
        )}
        {/* BUG-PHASE74-01 fix — pre-fix the disabled prop gated on
            wallet balance but NOT on max tip (= servicePrice). A user
            who entered a custom tip larger than the service price saw
            the Send Tip button enabled, tapped it, then got the alert
            "Tip Too Large" — same UI/state desync pattern as the suki
            redeem fix in Phase 73. Also added a similar inline warning
            for tip > maxTip mirroring the wallet-insufficient hint. */}
        {tipAmount > 0 && tipAmount > maxTip && (
          <Text style={styles.balanceWarn}>
            {platformTipMax < servicePrice
              ? `Tip exceeds platform cap of ${formatPHP(maxTip)}.`
              : `Tip exceeds ${formatPHP(maxTip)} (100% of service price).`}
          </Text>
        )}
      </View>
      </ScrollView>

      <View style={[styles.actions, !isPhone && styles.actionsWide]}>
        <Button
          title={loading ? 'Sending...' : `Send Tip${tipAmount > 0 ? ` • ${formatPHP(tipAmount)}` : ''}`}
          onPress={handleSendTip}
          loading={loading}
          disabled={tipAmount <= 0 || loading || tipAmount > walletBalance || tipAmount > maxTip}
        />
        <Button
          title="Maybe Later"
          onPress={() => router.replace({ pathname: Routes.CUSTOMER.BOOKING_MAKE_RECURRING, params: { bookingId: bookingId ?? '' } })}
          variant="ghost"
          disabled={loading}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted, paddingHorizontal: spacing.lg },
  scroll: { flex: 1, width: '100%' },
  scrollContent: { flexGrow: 1, paddingBottom: spacing.lg },
  content: { width: '100%', maxWidth: 640, alignSelf: 'center', alignItems: 'center' },
  contentWide: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
  },

  emoji: { fontSize: 64, marginBottom: spacing.base },
  title: { ...typography.h1, color: colors.text, textAlign: 'center', marginBottom: spacing.sm },
  subtitle: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.lg },

  guaranteeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.successLight,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.xl,
  },
  guaranteeText: { ...typography.bodySmall, color: colors.success, textAlign: 'center' },

  presetRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  presetChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  presetChipSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  presetPercent: { ...typography.body, fontWeight: '600', color: colors.text },
  presetAmount: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  presetTextSelected: { color: colors.primary },

  customInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    width: '100%',
    marginBottom: spacing.base,
  },
  currencyPrefix: { ...typography.h2, color: colors.text, marginRight: spacing.sm },
  customInput: { ...typography.h2, color: colors.text, flex: 1 },

  tipPreview: { ...typography.h3, color: colors.primary, marginTop: spacing.sm },
  balanceHint: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  balanceWarn: { ...typography.caption, color: colors.error, marginTop: spacing.xs, fontWeight: '600' },

  // BUG-PHASE193-01 fix styles for the optional message input.
  messageWrap: { width: '100%', marginTop: spacing.lg },
  messageLabel: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: spacing.xs },
  messageInput: {
    ...typography.body,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    color: colors.text,
    minHeight: 80,
    textAlignVertical: 'top' as const,
    borderWidth: 1,
    borderColor: colors.border,
  },
  messageCount: { ...typography.caption, color: colors.textTertiary, textAlign: 'right' as const, marginTop: spacing.xs },

  actions: { gap: spacing.xs },
  actionsWide: { width: '100%', maxWidth: 640, alignSelf: 'center', marginTop: spacing.base },
});
