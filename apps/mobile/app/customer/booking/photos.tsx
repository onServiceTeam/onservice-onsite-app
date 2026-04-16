import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Image,
  StyleSheet, Dimensions, Modal, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { getBookingById } from '@/services/booking.service';
import { colors, spacing, typography, borderRadius } from '@/config/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const THUMB_SIZE = (SCREEN_WIDTH - spacing.base * 2 - spacing.sm * 2) / 3;

type Tab = 'before' | 'after' | 'customer';

export default function BookingPhotosScreen(): React.ReactElement {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('before');
  const [viewingPhoto, setViewingPhoto] = useState<string | null>(null);

  const { data: booking, isLoading: bookingLoading, isError: bookingError, refetch } = useQuery({
    queryKey: ['booking', bookingId],
    queryFn: () => getBookingById(bookingId ?? ''),
    enabled: !!bookingId,
  });

  const beforePhotos = booking?.providerBeforePhotos ?? [];
  const afterPhotos = booking?.providerAfterPhotos ?? [];
  const customerPhotos = booking?.jobPhotos ?? [];

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'before', label: 'Before', count: beforePhotos.length },
    { id: 'after', label: 'After', count: afterPhotos.length },
    { id: 'customer', label: 'Customer', count: customerPhotos.length },
  ];

  const activePhotos =
    activeTab === 'before' ? beforePhotos
    : activeTab === 'after' ? afterPhotos
    : customerPhotos;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Job Photos</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.tabRow}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tab, activeTab === tab.id && styles.tabActive]}
            onPress={() => setActiveTab(tab.id)}
          >
            <Text style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]}>
              {tab.label} ({tab.count})
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {bookingLoading ? (
          <View style={styles.loadingCenter}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : bookingError ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyEmoji}>⚠️</Text>
            <Text style={styles.emptyTitle}>Could not load photos</Text>
            <Text style={styles.emptyDesc}>Please check your connection and try again.</Text>
            <TouchableOpacity onPress={() => void refetch()} style={styles.retryButton}>
              <Text style={styles.retryText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : activePhotos.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyEmoji}>📷</Text>
            <Text style={styles.emptyTitle}>
              No {activeTab === 'customer' ? 'Customer' : activeTab === 'before' ? 'Before' : 'After'} Photos
            </Text>
            <Text style={styles.emptyDesc}>
              {activeTab === 'before'
                ? 'The provider has not uploaded any photos taken before starting the job.'
                : activeTab === 'after'
                ? 'The provider has not uploaded any completion photos yet.'
                : 'No photos were submitted with the job request.'}
            </Text>
          </View>
        ) : (
          <>
            {activeTab === 'before' && afterPhotos.length > 0 && (
              <View style={styles.comparisonBanner}>
                <Text style={styles.comparisonIcon}>🔄</Text>
                <Text style={styles.comparisonText}>
                  Compare with {afterPhotos.length} after photo{afterPhotos.length !== 1 ? 's' : ''}
                </Text>
                <TouchableOpacity onPress={() => setActiveTab('after')}>
                  <Text style={styles.comparisonLink}>View After</Text>
                </TouchableOpacity>
              </View>
            )}
            {activeTab === 'after' && beforePhotos.length > 0 && (
              <View style={styles.comparisonBanner}>
                <Text style={styles.comparisonIcon}>🔄</Text>
                <Text style={styles.comparisonText}>
                  Compare with {beforePhotos.length} before photo{beforePhotos.length !== 1 ? 's' : ''}
                </Text>
                <TouchableOpacity onPress={() => setActiveTab('before')}>
                  <Text style={styles.comparisonLink}>View Before</Text>
                </TouchableOpacity>
              </View>
            )}
            <View style={styles.grid}>
              {activePhotos.map((url, index) => (
                <TouchableOpacity
                  key={`${activeTab}-${index}`}
                  style={styles.thumb}
                  onPress={() => setViewingPhoto(url)}
                >
                  <Image source={{ uri: url }} style={styles.thumbImage} />
                  <View style={styles.indexBadge}>
                    <Text style={styles.indexText}>{index + 1}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      <Modal
        visible={!!viewingPhoto}
        transparent
        animationType="fade"
        onRequestClose={() => setViewingPhoto(null)}
      >
        <View style={styles.modalBg}>
          <TouchableOpacity
            style={styles.modalClose}
            onPress={() => setViewingPhoto(null)}
          >
            <Text style={styles.modalCloseText}>✕</Text>
          </TouchableOpacity>
          {viewingPhoto && (
            <Image
              source={{ uri: viewingPhoto }}
              style={styles.fullImage}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    backgroundColor: colors.backgroundSecondary, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { padding: spacing.xs, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  backText: { fontSize: 22, color: colors.text },
  headerTitle: { ...typography.h3, color: colors.text },
  placeholder: { width: 30 },

  tabRow: {
    flexDirection: 'row', backgroundColor: colors.backgroundSecondary,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  tab: {
    flex: 1, paddingVertical: spacing.md, alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: colors.primary },
  tabText: { ...typography.bodySmall, color: colors.textSecondary },
  tabTextActive: { color: colors.primary, fontWeight: '700' },

  body: { flex: 1 },
  bodyContent: { padding: spacing.base, paddingBottom: 40 },

  emptyBox: { alignItems: 'center', paddingVertical: spacing.xxl },
  emptyEmoji: { fontSize: 48, marginBottom: spacing.md },
  emptyTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.xs },
  emptyDesc: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center', lineHeight: 20, paddingHorizontal: spacing.lg },
  loadingCenter: { alignItems: 'center', paddingTop: 60 },
  retryButton: { marginTop: spacing.base },
  retryText: { ...typography.body, color: colors.primary, fontWeight: '600' },

  comparisonBanner: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.base, gap: spacing.sm,
  },
  comparisonIcon: { fontSize: 16 },
  comparisonText: { ...typography.caption, color: colors.text, flex: 1 },
  comparisonLink: { ...typography.caption, color: colors.primary, fontWeight: '700' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  thumb: {
    width: THUMB_SIZE, height: THUMB_SIZE, borderRadius: borderRadius.md,
    overflow: 'hidden', backgroundColor: colors.backgroundSecondary,
  },
  thumbImage: { width: '100%', height: '100%' },
  indexBadge: {
    position: 'absolute', bottom: 4, right: 4,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center',
  },
  indexText: { color: colors.white, fontSize: 11, fontWeight: '700' },

  modalBg: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center', alignItems: 'center',
  },
  modalClose: {
    position: 'absolute', top: 60, right: 20, zIndex: 10,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  modalCloseText: { color: colors.white, fontSize: 20 },
  fullImage: { width: SCREEN_WIDTH - 40, height: SCREEN_WIDTH - 40 },
});
