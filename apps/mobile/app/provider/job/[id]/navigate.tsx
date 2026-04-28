import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Linking,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import api from '@/services/api';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import {
  ArrowLeft,
  MapPin,
  Navigation,
  CheckCircle2,
} from '@/components/icons';

interface JobLocation {
  customerName: string;
  address: string;
}

const FALLBACK_JOB: JobLocation = {
  customerName: 'Maria Santos',
  address: '123 Sample St, Quezon City',
};

export default function NavigateToJobScreen(): React.ReactElement {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [marking, setMarking] = useState(false);

  const job = FALLBACK_JOB;
  const encodedAddress = encodeURIComponent(job.address);
  const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodedAddress}`;
  const wazeUrl = `https://waze.com/ul?q=${encodedAddress}&navigate=yes`;

  const openExternal = async (url: string, label: string): Promise<void> => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert(label, `Cannot open ${label}. Please install the app or check your browser.`);
        return;
      }
      await Linking.openURL(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      Alert.alert(label, `Failed to open ${label}: ${msg}`);
    }
  };

  const handleArrived = async (): Promise<void> => {
    if (!id) {
      Alert.alert('Missing Job', 'No job ID provided.');
      return;
    }
    setMarking(true);
    try {
      await api.post(`/api/v1/bookings/${id}/arrived`);
      router.back();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not update arrival status.';
      Alert.alert('Failed', msg);
    } finally {
      setMarking(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} activeOpacity={0.7}>
          <ArrowLeft size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Navigate to Job</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.addressCard}>
          <View style={styles.addressIconWrap}>
            <MapPin size={22} color={colors.primary} />
          </View>
          <View style={styles.addressInfo}>
            <Text style={styles.customerName}>{job.customerName}</Text>
            <Text style={styles.addressText}>{job.address}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Open in maps app</Text>

        <TouchableOpacity
          style={styles.mapBtn}
          onPress={() => openExternal(googleMapsUrl, 'Google Maps')}
          activeOpacity={0.7}
        >
          <Navigation size={22} color={colors.white} />
          <Text style={styles.mapBtnText}>Open in Google Maps</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.mapBtn, styles.wazeBtn]}
          onPress={() => openExternal(wazeUrl, 'Waze')}
          activeOpacity={0.7}
        >
          <Navigation size={22} color={colors.white} />
          <Text style={styles.mapBtnText}>Open in Waze</Text>
        </TouchableOpacity>

        <View style={styles.etaCard}>
          <Text style={styles.etaLabel}>Estimated arrival</Text>
          <Text style={styles.etaValue}>ETA: ~25 min</Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.arrivedBtn, marking && styles.arrivedBtnDisabled]}
          onPress={handleArrived}
          activeOpacity={0.7}
          disabled={marking}
        >
          {marking ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <>
              <CheckCircle2 size={20} color={colors.white} />
              <Text style={styles.arrivedBtnText}>Mark Arrived</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  iconBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.h3, color: colors.text },
  body: { flex: 1 },
  bodyContent: { padding: spacing.base, paddingBottom: spacing.xl },
  addressCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  addressIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  addressInfo: { flex: 1 },
  customerName: { ...typography.body, fontWeight: '700', color: colors.text, marginBottom: 4 },
  addressText: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20 },
  sectionTitle: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.md,
  },
  mapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.lg,
    marginBottom: spacing.md,
  },
  wazeBtn: { backgroundColor: colors.info },
  mapBtnText: { ...typography.button, color: colors.white },
  etaCard: {
    backgroundColor: colors.successLight,
    borderRadius: borderRadius.md,
    padding: spacing.base,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  etaLabel: {
    ...typography.caption,
    color: colors.successDark,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  etaValue: { ...typography.h3, color: colors.successDark },
  footer: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  arrivedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.success,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.base,
  },
  arrivedBtnDisabled: { opacity: 0.6 },
  arrivedBtnText: { ...typography.button, color: colors.white },
});
