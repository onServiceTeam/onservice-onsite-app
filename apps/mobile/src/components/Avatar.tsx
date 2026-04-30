/**
 * Phase 14 Dispatch 11 — Avatar
 *
 * Provider/customer avatar with initials fallback. Used on booking detail,
 * provider profile, chat list. Pattern 12 (lazy image) reuses LazyImage
 * for the photo path; this component adds the initials-on-error fallback.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { colors, borderRadius, typography } from '@/config/theme';

export interface AvatarProps {
  uri?: string | null;
  name?: string;
  size?: number;
  testID?: string;
}

function getInitials(name?: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function Avatar({
  uri,
  name,
  size = 40,
  testID,
}: AvatarProps): React.ReactElement {
  const [errored, setErrored] = useState(false);
  const showImage = uri && !errored;
  const dim = { width: size, height: size, borderRadius: size / 2 };

  if (showImage) {
    return (
      <Image
        source={{ uri }}
        onError={() => setErrored(true)}
        style={[styles.image, dim]}
        accessibilityLabel={name ? `${name}'s profile picture` : 'Profile picture'}
        testID={testID}
      />
    );
  }

  return (
    <View
      style={[styles.fallback, dim]}
      accessibilityLabel={name ? `${name}'s initials` : 'Initials avatar'}
      testID={testID}
    >
      <Text style={[styles.initials, { fontSize: size * 0.4 }]}>
        {getInitials(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: { backgroundColor: colors.divider },
  fallback: {
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.full,
  },
  initials: {
    ...typography.body,
    fontWeight: '700',
    color: colors.primary,
  },
});

export default Avatar;
