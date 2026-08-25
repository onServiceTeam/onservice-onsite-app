import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Dimensions,
  StyleSheet,
  ViewToken,
  LayoutChangeEvent,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { storage } from '@/services/api';
import { Button } from '@/components/ui';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import type { ComponentType } from 'react';
import { Home, Lock, Star } from '@/components/icons';
import { useResponsive } from '@/hooks/useResponsive';

import { Routes } from '@/config/navigation';
type IconProps = { size?: number; color?: string };
type IconComponent = ComponentType<IconProps>;

interface Slide {
  id: string;
  icon: IconComponent;
  title: string;
  description: string;
  bgColor: string;
}

const slides: Slide[] = [
  {
    id: '1',
    icon: Home,
    title: 'Home Services\nOn Demand',
    description:
      'From cleaning to plumbing, electrical to aircon — book trusted professionals in your area.',
    bgColor: colors.primary,
  },
  {
    // Bug 860 — Phase 14 D04 SiguradoShield pull. Slide 2 previously
    // advertised SiguradoShield™ insurance with implied peso-amount coverage.
    // Replaced with verifiable trust claim (escrow only). Do NOT reintroduce
    // SiguradoShield language without lifting LAUNCH-LIMITATIONS §23.
    id: '2',
    icon: Lock,
    title: 'Booked With\nA Clear Record',
    description:
      'When a booking shows paid and held, its payment is in escrow. You can confirm the job or open a case from the booking, and support can review the same evidence.',
    bgColor: colors.secondaryDark,
  },
  {
    id: '3',
    icon: Star,
    title: 'Vetted & Verified\nProviders',
    description:
      'Every provider is NBI-cleared, ID-verified, and rated by customers just like you.',
    bgColor: colors.tierPro,
  },
];

export default function OnboardingScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isPhone } = useResponsive();
  const [activeIndex, setActiveIndex] = useState(0);
  // Measure the pager surface instead of assuming the OS window matches the app
  // frame. This keeps each slide exact on phone, tablet, and bounded desktop.
  const [pageWidth, setPageWidth] = useState<number>(Dimensions.get('window').width);
  const [pageHeight, setPageHeight] = useState<number>(Dimensions.get('window').height);
  const flatListRef = useRef<FlatList>(null);

  const onContainerLayout = (e: LayoutChangeEvent): void => {
    const w = e.nativeEvent.layout.width;
    const h = e.nativeEvent.layout.height;
    if (w > 0 && w !== pageWidth) setPageWidth(w);
    if (h > 0 && h !== pageHeight) setPageHeight(h);
  };

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0]?.index != null) {
        setActiveIndex(viewableItems[0].index);
      }
    },
  ).current;

  const handleNext = (): void => {
    if (activeIndex < slides.length - 1) {
      flatListRef.current?.scrollToIndex({ index: activeIndex + 1 });
    } else {
      completeOnboarding();
    }
  };

  const completeOnboarding = (): void => {
    storage.set('hasOnboarded', true);
    router.replace(Routes.AUTH.LOGIN);
  };

  const renderSlide = ({ item }: { item: Slide }): React.ReactElement => {
    const SlideIcon = item.icon;
    return (
      <View
        style={[
          styles.slide,
          !isPhone && styles.slideWide,
          { width: pageWidth, height: pageHeight, backgroundColor: isPhone ? item.bgColor : colors.surface },
        ]}
      >
        <View style={[styles.visualPanel, !isPhone && styles.visualPanelWide, { backgroundColor: item.bgColor }]}>
          <View style={styles.slideIconWrap}><SlideIcon size={isPhone ? 96 : 128} color={colors.white} /></View>
          {!isPhone ? <Text style={styles.visualBrand}>onService PH</Text> : null}
        </View>
        <View style={[styles.copyPanel, !isPhone && styles.copyPanelWide]}>
          {!isPhone ? <Text style={styles.eyebrow}>CLEAR, ON-APP SERVICE RECORDS</Text> : null}
          <Text style={[styles.slideTitle, !isPhone && styles.slideTitleWide]}>{item.title}</Text>
          <Text style={[styles.slideDescription, !isPhone && styles.slideDescriptionWide]}>{item.description}</Text>
        </View>
      </View>
    );
  };

  return (
    <View
      style={[styles.container, { paddingBottom: insets.bottom + spacing.base }]}
      onLayout={onContainerLayout}
      accessibilityLabel={isPhone ? 'Customer onboarding' : 'Tablet and desktop customer onboarding'}
      testID="customer-onboarding"
    >
      <FlatList
        ref={flatListRef}
        data={slides}
        renderItem={renderSlide}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ viewAreaCoveragePercentThreshold: 50 }}
        getItemLayout={(_, index) => ({ length: pageWidth, offset: pageWidth * index, index })}
      />

      <View style={[styles.footer, !isPhone && styles.footerWide]}>
        <View style={styles.dots}>
          {slides.map((_, idx) => (
            <View
              key={idx}
              style={[
                styles.dot,
                !isPhone && styles.dotWide,
                idx === activeIndex && styles.dotActive,
                !isPhone && idx === activeIndex && styles.dotActiveWide,
              ]}
            />
          ))}
        </View>

        <View style={styles.actions}>
          {activeIndex < slides.length - 1 && (
            <Button
              title="Skip"
              onPress={completeOnboarding}
              variant="ghost"
              fullWidth={false}
              textStyle={StyleSheet.flatten([styles.skipText, !isPhone && styles.skipTextWide])}
            />
          )}
          <Button
            title={activeIndex === slides.length - 1 ? 'Get Started' : 'Next'}
            onPress={handleNext}
            variant="primary"
            fullWidth={false}
            style={StyleSheet.flatten([styles.nextButton, !isPhone && styles.nextButtonWide])}
            textStyle={StyleSheet.flatten([styles.nextButtonText, !isPhone && styles.nextButtonTextWide])}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  slideWide: { flexDirection: 'row', paddingHorizontal: 0, alignItems: 'stretch' },
  visualPanel: { alignItems: 'center', justifyContent: 'center' },
  visualPanelWide: { width: '38%', paddingHorizontal: spacing.xl },
  visualBrand: { ...typography.h3, color: colors.white, marginTop: spacing.lg },
  copyPanel: { alignItems: 'center' },
  copyPanelWide: { flex: 1, alignItems: 'flex-start', justifyContent: 'center', paddingHorizontal: 64, paddingBottom: 90 },
  eyebrow: { ...typography.caption, color: colors.primary, fontWeight: '800', letterSpacing: 1.2, marginBottom: spacing.md },
  slideIcon: { fontSize: 80, marginBottom: spacing.xl },
  slideIconWrap: { marginBottom: spacing.xl, alignItems: 'center' as const },
  slideTitle: {
    ...typography.h1,
    color: colors.white,
    textAlign: 'center',
    marginBottom: spacing.base,
  },
  slideTitleWide: { color: colors.text, textAlign: 'left', fontSize: 42, lineHeight: 48, maxWidth: 560 },
  slideDescription: {
    ...typography.body,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    lineHeight: 24,
  },
  slideDescriptionWide: { color: colors.textSecondary, textAlign: 'left', fontSize: 18, lineHeight: 28, maxWidth: 580 },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  footerWide: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
    paddingTop: spacing.md,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  dotActive: { backgroundColor: colors.white, width: 24 },
  dotWide: { backgroundColor: colors.border },
  dotActiveWide: { backgroundColor: colors.primary },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skipText: { color: 'rgba(255,255,255,0.7)' },
  skipTextWide: { color: colors.primary },
  nextButton: {
    backgroundColor: colors.white,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.lg,
  },
  nextButtonText: {
    color: colors.primary,
  },
  nextButtonWide: { backgroundColor: colors.primary },
  nextButtonTextWide: { color: colors.white },
});
