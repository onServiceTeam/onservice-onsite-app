// apps/mobile/src/web-stubs/react-native-maps.tsx
//
// Phase 200 — web stub for react-native-maps (no browser support). Metro
// resolves react-native-maps to this file on the web platform (see
// metro.config.js). Screens that show a map (address picker, tracker,
// provider active-job, provider service-area) render this lightweight
// placeholder in a browser instead of crashing the bundle. Full maps remain
// available in the native mobile app.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta?: number;
  longitudeDelta?: number;
};

export const PROVIDER_GOOGLE = 'google';
export const PROVIDER_DEFAULT = undefined;

function MapView(props: { style?: unknown; children?: React.ReactNode }): React.ReactElement {
  return (
    <View style={[styles.box, props.style as object]}>
      <Text style={styles.title}>Map preview</Text>
      <Text style={styles.sub}>The interactive map is available in the onService mobile app.</Text>
      {props.children}
    </View>
  );
}

// Sub-components used by the map screens — render nothing on web.
export function Marker(): null { return null; }
export function Callout(): null { return null; }
export function Circle(): null { return null; }
export function Polyline(): null { return null; }
export function Polygon(): null { return null; }

const styles = StyleSheet.create({
  box: { minHeight: 200, alignItems: 'center', justifyContent: 'center', backgroundColor: '#e8eef0', padding: 16 },
  title: { fontWeight: '600', color: '#0f766e', marginBottom: 4 },
  sub: { color: '#475569', fontSize: 12, textAlign: 'center' },
});

export default MapView;
