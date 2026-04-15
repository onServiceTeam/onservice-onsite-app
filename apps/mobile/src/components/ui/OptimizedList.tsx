import React, { useCallback, useRef, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  View,
  type FlatListProps,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { hapticLight } from '@/utils/haptics';
import { EndOfList } from './EndOfList';
import { ScrollToTop } from './ScrollToTop';
import { colors } from '@/config/theme';

const SCROLL_TO_TOP_THRESHOLD = 600;

interface OptimizedListProps<T> extends Omit<FlatListProps<T>, 'refreshControl'> {
  onRefresh?: () => Promise<void>;
  showEndIndicator?: boolean;
  showScrollToTop?: boolean;
  estimatedItemHeight?: number;
}

export function OptimizedList<T>({
  onRefresh,
  showEndIndicator = true,
  showScrollToTop = true,
  estimatedItemHeight,
  ...rest
}: OptimizedListProps<T>): React.ReactElement {
  const [refreshing, setRefreshing] = useState(false);
  const [showTopButton, setShowTopButton] = useState(false);
  const listRef = useRef<FlatList<T>>(null);

  const handleRefresh = useCallback(async () => {
    if (!onRefresh) return;
    setRefreshing(true);
    await hapticLight();
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetY = event.nativeEvent.contentOffset.y;
      setShowTopButton(offsetY > SCROLL_TO_TOP_THRESHOLD);
      rest.onScroll?.(event);
    },
    [rest.onScroll],
  );

  const scrollToTop = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  const getItemLayout = estimatedItemHeight
    ? (_data: ArrayLike<T> | null | undefined, index: number) => ({
        length: estimatedItemHeight,
        offset: estimatedItemHeight * index,
        index,
      })
    : undefined;

  const ListFooter = useCallback(() => {
    if (!showEndIndicator) return null;
    const data = rest.data;
    if (!data || (Array.isArray(data) && data.length === 0)) return null;
    return <EndOfList />;
  }, [showEndIndicator, rest.data]);

  return (
    <View style={styles.wrapper}>
      <FlatList<T>
        ref={listRef}
        {...rest}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        windowSize={5}
        initialNumToRender={10}
        updateCellsBatchingPeriod={50}
        getItemLayout={getItemLayout}
        ListFooterComponent={ListFooter}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          ) : undefined
        }
      />
      {showScrollToTop && (
        <ScrollToTop visible={showTopButton} onPress={scrollToTop} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
});
