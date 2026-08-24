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
  const [activeIndex, setActiveIndex] = useState(0);
  // Width of the pager's own container, not the OS window. On the web build the
  // app runs inside a centered phone-width column (see WebAppFrame), so the
  // window width (e.g. 1440) is wider than the actual pager. Measuring the
  // container keeps each slide exactly one page wide and paging accurate at any
  // size. Initialise to the window width so the first frame is sensible.
  const [pageWidth, setPageWidth] = useState<number>(Dimensions.get('window').width);
  const flatListRef = useRef<FlatList>(null);

  const onContainerLayout = (e: LayoutChangeEvent): void => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && w !== pageWidth) setPageWidth(w);
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
      <View style={[styles.slide, { width: pageWidth, backgroundColor: item.bgColor }]}>
        <View style={styles.slideIconWrap}><SlideIcon size={96} color={colors.white} /></View>
        <Text style={styles.slideTitle}>{item.title}</Text>
        <Text style={styles.slideDescription}>{item.description}</Text>
      </View>
    );
  };

  return (
    <View
      style={[styles.container, { paddingBottom: insets.bottom + spacing.base }]}
      onLayout={onContainerLayout}
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

      <View style={styles.footer}>
        <View style={styles.dots}>
          {slides.map((_, idx) => (
            <View
              key={idx}
              style={[styles.dot, idx === activeIndex && styles.dotActive]}
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
              textStyle={styles.skipText}
            />
          )}
          <Button
            title={activeIndex === slides.length - 1 ? 'Get Started' : 'Next'}
            onPress={handleNext}
            variant="primary"
            fullWidth={false}
            style={styles.nextButton}
            textStyle={styles.nextButtonText}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.primary },
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  slideIcon: { fontSize: 80, marginBottom: spacing.xl },
  slideIconWrap: { marginBottom: spacing.xl, alignItems: 'center' as const },
  slideTitle: {
    ...typography.h1,
    color: colors.white,
    textAlign: 'center',
    marginBottom: spacing.base,
  },
  slideDescription: {
    ...typography.body,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    lineHeight: 24,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
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
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skipText: { color: 'rgba(255,255,255,0.7)' },
  nextButton: {
    backgroundColor: colors.white,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.lg,
  },
  nextButtonText: {
    color: colors.primary,
  },
});
