import React from 'react';
import { ActivityIndicator, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors } from '@/config/theme';
import type { FixedPriceFlow } from '@/hooks/useFixedPriceFlowGuard';

/**
 * D41 Q39: what an old fixed-price screen (configure, form, checkout) shows
 * instead of itself. While the config is still answering it shows a neutral
 * loading state, so the old screen and its Pay button never flash up while
 * request-first booking is on. Once request-first is on it stays blank while
 * the request form opens.
 */
export default function FixedPriceFlowHold({
  flow,
  style,
}: {
  flow: Exclude<FixedPriceFlow, 'stay'>;
  style?: StyleProp<ViewStyle>;
}): React.ReactElement {
  if (flow === 'leaving') {
    return <View style={style} accessibilityLabel="Opening the request form" />;
  }
  return (
    <View
      style={[style, { alignItems: 'center', justifyContent: 'center' }]}
      accessibilityLabel="Loading booking"
      accessibilityState={{ busy: true }}
    >
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}
