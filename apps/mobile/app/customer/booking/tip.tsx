import React, { useState } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { View, Text, StyleSheet, TouchableOpacity, Alert, TextInput, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation } from '@tanstack/react-query';
import { getBookingById } from '@/services/booking.service';
import { sendTip } from '@/services/tip.service';
import { Button } from '@/components/ui';
import { formatPHP } from '@/utils/currency';
import { platformConfig } from '@/config/platform.config';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { AlertTriangle } from '@/components/icons';

const TIP_PERCENTAGES = [10, 15, 20] as const;

export default function TipScreen(): React.ReactElement {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [selectedPercent, setSelectedPercent] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  const { data: booking, isLoading: bookingLoading, isError: bookingError, refetch } = useQuery({
    queryKey: ['booking', bookingId],
    queryFn: () => getBookingById(bookingId ?? ''),
    enabled: !!bookingId,
  });

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

  const maxTip = servicePrice;

  const tipMutation = useMutation({
    mutationFn: (amount: number) => sendTip({
      bookingId: bookingId ?? '',
      amount,
      paymentMethod: 'wallet',
    }),
    onSuccess: () => {
      Alert.alert('Thank you!', 'Your tip has been sent to the provider.', [
        { text: 'Done', onPress: (): void => { router.replace({ pathname: '/customer/booking/make-recurring', params: { bookingId: bookingId ?? '' } }); } },
      ]);
    },
    onError: (err: unknown) => {
      const axErr = err as { response?: { data?: { error?: { message?: string } } } };
      const msg = axErr?.response?.data?.error?.message;
      Alert.alert('Error', msg ?? 'Failed to send tip. Please try again.');
    },
  });

  const loading = tipMutation.isPending;

  const handleSendTip = (): void => {
    if (tipAmount <= 0) {
      Alert.alert('Enter Amount', 'Please select or enter a tip amount.');
      return;
    }
    if (tipAmount > maxTip) {
      Alert.alert('Tip Too Large', `Maximum tip is ${formatPHP(maxTip)} (100% of service price).`);
      return;
    }
    tipMutation.mutate(tipAmount);
  };

  if (bookingLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + spacing.xxl, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (bookingError) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + spacing.xxl, alignItems: 'center', justifyContent: 'center', padding: 24 }]}>
        <View style={{ marginBottom: 12, alignItems: 'center' as const }}><AlertTriangle size={48} color={colors.error} /></View>
        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 8 }}>Something went wrong</Text>
        <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginBottom: 16 }}>Failed to load booking details. Please try again.</Text>
        <TouchableOpacity onPress={() => void refetch()} style={{ backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10, minHeight: 44, justifyContent: 'center' as const }}>
          <Text style={{ color: colors.white, fontWeight: '600' }}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.base }]}>
      <View style={styles.content}>
        <Text style={styles.emoji}>🎉</Text>
        <Text style={styles.title}>Tip Your Provider</Text>
        <Text style={styles.subtitle}>
          Show your appreciation for great service.
        </Text>

        <View style={styles.guaranteeBadge}>
          <Text style={styles.guaranteeText}>💚 100% goes to the provider — no commission on tips</Text>
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
            />
          </View>
        )}

        {tipAmount > 0 && (
          <Text style={styles.tipPreview}>Tip amount: {formatPHP(tipAmount)}</Text>
        )}
      </View>

      <View style={styles.actions}>
        <Button
          title={loading ? 'Sending...' : `Send Tip${tipAmount > 0 ? ` • ${formatPHP(tipAmount)}` : ''}`}
          onPress={handleSendTip}
          loading={loading}
          disabled={tipAmount <= 0 || loading}
        />
        <Button
          title="Maybe Later"
          onPress={() => router.replace({ pathname: '/customer/booking/make-recurring', params: { bookingId: bookingId ?? '' } })}
          variant="ghost"
          disabled={loading}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  content: { flex: 1, alignItems: 'center' },

  emoji: { fontSize: 64, marginBottom: spacing.base },
  title: { ...typography.h1, color: colors.text, textAlign: 'center', marginBottom: spacing.sm },
  subtitle: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.lg },

  guaranteeBadge: {
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
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  presetChipSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  presetPercent: { ...typography.body, fontWeight: '600', color: colors.text },
  presetAmount: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  presetTextSelected: { color: colors.primary },

  customInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    width: '100%',
    marginBottom: spacing.base,
  },
  currencyPrefix: { ...typography.h2, color: colors.text, marginRight: spacing.sm },
  customInput: { ...typography.h2, color: colors.text, flex: 1 },

  tipPreview: { ...typography.h3, color: colors.primary, marginTop: spacing.sm },

  actions: { gap: spacing.xs },
});
