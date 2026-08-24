import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  Modal,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { getBookingById } from '@/services/booking.service';
import {
  listBookingPhotos,
  type BookingPhotoListItem,
  type PhotoType,
} from '@/services/booking-photo.service';
import { useResponsive } from '@/hooks/useResponsive';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { Camera, ChevronLeft, Repeat, X } from '@/components/icons';
import { SkeletonCard, EmptyState, ErrorState } from '@/components/ui';

type Tab = 'before' | 'work' | 'after' | 'customer';

interface EvidencePhoto {
  key: string;
  url: string;
  photoType: PhotoType;
  role: 'customer' | 'provider' | 'admin';
  uploadedAt: string | null;
  source: 'canonical' | 'legacy';
}

const TAB_LABELS: Record<Tab, string> = {
  before: 'Before',
  work: 'Work',
  after: 'After',
  customer: 'Customer',
};

function canonicalEvidence(photo: BookingPhotoListItem): EvidencePhoto {
  return {
    key: photo.id,
    url: photo.storageUrl,
    photoType: photo.photoType,
    role: photo.uploadedByRole,
    uploadedAt: photo.uploadedAt,
    source: 'canonical',
  };
}

function mergeLegacy(
  canonical: EvidencePhoto[],
  legacyUrls: string[],
  photoType: PhotoType,
  role: 'customer' | 'provider',
): EvidencePhoto[] {
  const seen = new Set(canonical.map((photo) => photo.url));
  const legacy = legacyUrls
    .filter((url) => !seen.has(url))
    .map((url, index) => ({
      key: `legacy-${photoType}-${index}-${url}`,
      url,
      photoType,
      role,
      uploadedAt: null,
      source: 'legacy' as const,
    }));
  return [...canonical, ...legacy];
}

function evidenceDate(value: string | null): string {
  if (!value) return 'Date unavailable';
  return new Date(value).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function evidenceLabel(photo: EvidencePhoto): string {
  if (photo.source === 'legacy') {
    if (photo.role === 'customer') return 'Legacy customer photo';
    const legacyKind = photo.photoType.charAt(0).toUpperCase() + photo.photoType.slice(1);
    return `Legacy provider record · ${legacyKind}`;
  }
  const actor =
    photo.role === 'provider'
      ? 'Provider'
      : photo.role === 'customer'
        ? 'Customer'
        : 'onService admin';
  const kind = photo.photoType.charAt(0).toUpperCase() + photo.photoType.slice(1);
  return `${actor} · ${kind}`;
}

export default function BookingPhotosScreen(): React.ReactElement {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const router = useRouter();
  const { width, isPhone } = useResponsive();
  const [activeTab, setActiveTab] = useState<Tab>('before');
  const [viewingPhoto, setViewingPhoto] = useState<EvidencePhoto | null>(null);

  const bookingQuery = useQuery({
    queryKey: ['booking', bookingId],
    queryFn: () => getBookingById(bookingId ?? ''),
    enabled: !!bookingId,
  });

  const photosQuery = useQuery({
    queryKey: ['bookingPhotos', bookingId],
    queryFn: () => listBookingPhotos(bookingId ?? ''),
    enabled: !!bookingId,
  });

  const evidence = useMemo(() => {
    const canonical = (photosQuery.data ?? []).map(canonicalEvidence);
    const providerBefore = canonical.filter(
      (photo) => photo.role === 'provider' && photo.photoType === 'before',
    );
    const providerAfter = canonical.filter(
      (photo) => photo.role === 'provider' && photo.photoType === 'after',
    );
    const providerWork = canonical.filter(
      (photo) =>
        photo.role === 'provider' &&
        (photo.photoType === 'during' ||
          photo.photoType === 'issue' ||
          photo.photoType === 'checklist'),
    );
    const customer = canonical.filter((photo) => photo.role === 'customer');

    return {
      before: mergeLegacy(
        providerBefore,
        bookingQuery.data?.providerBeforePhotos ?? [],
        'before',
        'provider',
      ),
      work: providerWork,
      after: mergeLegacy(
        providerAfter,
        bookingQuery.data?.providerAfterPhotos ?? [],
        'after',
        'provider',
      ),
      customer: mergeLegacy(customer, bookingQuery.data?.jobPhotos ?? [], 'during', 'customer'),
    } satisfies Record<Tab, EvidencePhoto[]>;
  }, [bookingQuery.data, photosQuery.data]);

  const tabs = (Object.keys(TAB_LABELS) as Tab[]).map((tab) => ({
    id: tab,
    label: TAB_LABELS[tab],
    count: evidence[tab].length,
  }));
  const activePhotos = evidence[activeTab];
  const hasLegacyEvidence = Boolean(
    bookingQuery.data?.providerBeforePhotos?.length ||
    bookingQuery.data?.providerAfterPhotos?.length ||
    bookingQuery.data?.jobPhotos?.length,
  );
  const isLoading = bookingQuery.isLoading || photosQuery.isLoading;
  const isRefreshing = bookingQuery.isRefetching || photosQuery.isRefetching;
  const modalWidth = Math.max(280, Math.min(width - spacing.xl * 2, 1000));
  const modalHeight = Math.max(280, Math.min(width * 0.68, 760));

  const refreshAll = (): void => {
    void bookingQuery.refetch();
    void photosQuery.refetch();
  };

  const emptyDescription =
    activeTab === 'before'
      ? 'The provider has not uploaded evidence from before work started.'
      : activeTab === 'work'
        ? 'No during-work, checklist, or issue evidence has been uploaded.'
        : activeTab === 'after'
          ? 'The provider has not uploaded completion evidence yet.'
          : 'No customer-submitted job photos are on this booking.';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Job Evidence</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={[styles.bodyContent, !isPhone && styles.bodyContentWide]}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refreshAll} />}
      >
        <View
          style={[styles.workspace, !isPhone && styles.workspaceWide]}
          accessibilityLabel={
            !isPhone ? 'Tablet and desktop customer job evidence workspace' : undefined
          }
        >
          {!isPhone && (
            <View style={styles.contextRail} accessibilityLabel="Booking evidence context">
              <Text style={styles.contextEyebrow}>WORK RECORD</Text>
              <Text style={styles.contextTitle}>
                {bookingQuery.data?.serviceName ??
                  bookingQuery.data?.categoryName ??
                  'Service booking'}
              </Text>
              {bookingQuery.data?.providerName ? (
                <Text style={styles.contextLine}>Provider: {bookingQuery.data.providerName}</Text>
              ) : null}
              {bookingQuery.data?.scheduledAt ? (
                <Text style={styles.contextLine}>
                  Scheduled: {evidenceDate(bookingQuery.data.scheduledAt)}
                </Text>
              ) : null}
              {bookingQuery.data?.address ? (
                <Text style={styles.contextLine}>Site: {bookingQuery.data.address}</Text>
              ) : null}
              <View style={styles.contextDivider} />
              <Text style={styles.contextCount}>{photosQuery.data?.length ?? 0}</Text>
              <Text style={styles.contextLine}>canonical evidence records</Text>
              <Text style={styles.contextNote}>
                Each canonical item keeps its uploader role, evidence type, and upload time. Legacy
                booking arrays are labeled separately because those details are unavailable.
              </Text>
            </View>
          )}

          <View style={styles.evidenceMain}>
            <View style={styles.tabRow} accessibilityLabel="Evidence type tabs">
              {tabs.map((tab) => (
                <TouchableOpacity
                  key={tab.id}
                  style={[styles.tab, activeTab === tab.id && styles.tabActive]}
                  onPress={() => setActiveTab(tab.id)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: activeTab === tab.id }}
                >
                  <Text style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]}>
                    {tab.label} ({tab.count})
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {isLoading ? (
              <View style={styles.loadingCenter} accessibilityLabel="Job evidence loading state">
                <SkeletonCard />
                <SkeletonCard />
              </View>
            ) : bookingQuery.isError ? (
              <ErrorState
                message="We couldn't load this booking's evidence context. Please check your connection and try again."
                onRetry={refreshAll}
              />
            ) : photosQuery.isError && !hasLegacyEvidence ? (
              <ErrorState
                message="We couldn't load the canonical job evidence. Retry before treating this booking as having no photos."
                onRetry={() => void photosQuery.refetch()}
              />
            ) : (
              <>
                {photosQuery.isError && hasLegacyEvidence && (
                  <View
                    style={styles.warningBanner}
                    accessibilityLabel="Canonical evidence warning"
                  >
                    <Text style={styles.warningText}>
                      Canonical evidence could not be loaded. Older booking photos remain visible
                      below, but uploader and time details are unavailable.
                    </Text>
                    <TouchableOpacity
                      onPress={() => void photosQuery.refetch()}
                      accessibilityRole="button"
                    >
                      <Text style={styles.warningAction}>Retry</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {activePhotos.length === 0 ? (
                  <EmptyState
                    icon={<Camera size={48} color={colors.textTertiary} />}
                    title={`No ${TAB_LABELS[activeTab]} Evidence`}
                    description={emptyDescription}
                  />
                ) : (
                  <>
                    {activeTab === 'before' && evidence.after.length > 0 && (
                      <View style={styles.comparisonBanner}>
                        <Repeat size={16} color={colors.primary} />
                        <Text style={styles.comparisonText}>
                          Compare with {evidence.after.length} after photo
                          {evidence.after.length === 1 ? '' : 's'}
                        </Text>
                        <TouchableOpacity onPress={() => setActiveTab('after')}>
                          <Text style={styles.comparisonLink}>View After</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    {activeTab === 'after' && evidence.before.length > 0 && (
                      <View style={styles.comparisonBanner}>
                        <Repeat size={16} color={colors.primary} />
                        <Text style={styles.comparisonText}>
                          Compare with {evidence.before.length} before photo
                          {evidence.before.length === 1 ? '' : 's'}
                        </Text>
                        <TouchableOpacity onPress={() => setActiveTab('before')}>
                          <Text style={styles.comparisonLink}>View Before</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    <View
                      style={styles.grid}
                      accessibilityLabel={`${TAB_LABELS[activeTab]} evidence grid`}
                    >
                      {activePhotos.map((photo, index) => (
                        <TouchableOpacity
                          key={photo.key}
                          style={[styles.thumb, isPhone ? styles.thumbPhone : styles.thumbWide]}
                          onPress={() => setViewingPhoto(photo)}
                          accessibilityRole="button"
                          accessibilityLabel={`Open ${evidenceLabel(photo)} evidence ${index + 1}`}
                        >
                          <Image source={{ uri: photo.url }} style={styles.thumbImage} />
                          <View style={styles.thumbMeta}>
                            <Text style={styles.thumbActor} numberOfLines={1}>
                              {evidenceLabel(photo)}
                            </Text>
                            <Text style={styles.thumbDate} numberOfLines={1}>
                              {evidenceDate(photo.uploadedAt)}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}
              </>
            )}
          </View>
        </View>
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
            accessibilityRole="button"
            accessibilityLabel="Close evidence photo"
          >
            <X size={20} color={colors.white} />
          </TouchableOpacity>
          {viewingPhoto && (
            <View style={styles.modalContent}>
              <Image
                source={{ uri: viewingPhoto.url }}
                style={{ width: modalWidth, height: modalHeight }}
                resizeMode="contain"
              />
              <Text style={styles.modalLabel}>
                {evidenceLabel(viewingPhoto)} · {evidenceDate(viewingPhoto.uploadedAt)}
              </Text>
            </View>
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { padding: spacing.xs, minWidth: 44, minHeight: 44, justifyContent: 'center' },
  headerTitle: { ...typography.h3, color: colors.text },
  placeholder: { width: 30 },
  body: { flex: 1 },
  bodyContent: { padding: spacing.base, paddingBottom: 40 },
  bodyContentWide: { width: '100%', maxWidth: 1220, alignSelf: 'center', padding: spacing.lg },
  workspace: { width: '100%' },
  workspaceWide: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg },
  contextRail: {
    width: 300,
    flexShrink: 0,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
  },
  contextEyebrow: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  contextTitle: { ...typography.h2, color: colors.text, marginBottom: spacing.lg },
  contextLine: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  contextDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  contextCount: { fontSize: 28, fontWeight: '800', color: colors.text },
  contextNote: {
    ...typography.caption,
    color: colors.textTertiary,
    lineHeight: 18,
    marginTop: spacing.lg,
  },
  evidenceMain: { flex: 1, minWidth: 0 },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    marginBottom: spacing.base,
  },
  tab: {
    flex: 1,
    minHeight: 48,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: colors.primary, backgroundColor: colors.primaryLight },
  tabText: { ...typography.caption, color: colors.textSecondary, textAlign: 'center' },
  tabTextActive: { color: colors.primary, fontWeight: '700' },
  loadingCenter: { paddingTop: spacing.lg },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.warningLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.base,
  },
  warningText: { ...typography.bodySmall, color: colors.text, flex: 1, lineHeight: 20 },
  warningAction: { ...typography.bodySmall, color: colors.primary, fontWeight: '700' },
  comparisonBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.base,
    gap: spacing.sm,
  },
  comparisonText: { ...typography.caption, color: colors.text, flex: 1 },
  comparisonLink: { ...typography.caption, color: colors.primary, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, alignItems: 'flex-start' },
  thumb: {
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  thumbPhone: { width: '47.5%' },
  thumbWide: { width: '31.5%' },
  thumbImage: { width: '100%', aspectRatio: 1.25, backgroundColor: colors.backgroundSecondary },
  thumbMeta: { padding: spacing.sm },
  thumbActor: { ...typography.caption, color: colors.text, fontWeight: '700' },
  thumbDate: { fontSize: 10, color: colors.textTertiary, marginTop: 2 },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalClose: {
    position: 'absolute',
    top: 40,
    right: 24,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalContent: { maxWidth: '100%', alignItems: 'center' },
  modalLabel: {
    ...typography.bodySmall,
    color: colors.white,
    marginTop: spacing.md,
    textAlign: 'center',
  },
});
