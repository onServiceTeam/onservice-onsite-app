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

export interface MapViewHandle {
  animateToRegion: (region: Region, duration?: number) => void;
}

interface MapPressEvent {
  nativeEvent: { coordinate: { latitude: number; longitude: number } };
}

interface MapViewProps {
  style?: unknown;
  children?: React.ReactNode;
  initialRegion?: Region;
  region?: Region;
  onPress?: (event: MapPressEvent) => void;
  pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only';
  accessibilityLabel?: string;
}

const MapView = React.forwardRef<MapViewHandle, MapViewProps>(function MapView(
  props,
  ref,
): React.ReactElement {
  React.useImperativeHandle(ref, () => ({ animateToRegion: () => undefined }), []);
  const center = props.region ?? props.initialRegion;
  return (
    <View
      style={[styles.box, props.style as object]}
      accessibilityLabel={props.accessibilityLabel}
    >
      <Text style={styles.title}>Map preview</Text>
      <Text style={styles.sub}>Map location and status are shown here. Use the address controls or device location to provide exact booking coordinates.</Text>
      {center ? <Text style={styles.coordinates}>Center: {center.latitude.toFixed(4)}, {center.longitude.toFixed(4)}</Text> : null}
      <View style={styles.children}>{props.children}</View>
    </View>
  );
});

interface MarkerProps {
  title?: string;
  coordinate?: { latitude: number; longitude: number };
  pinColor?: string;
}

// These browser-safe overlays are deliberately lightweight. They keep the
// location/status surfaces usable without introducing a second map provider or
// pretending that a static map is live GPS evidence.
export function Marker({ title = 'Map marker', coordinate }: MarkerProps): React.ReactElement {
  return (
    <View accessible accessibilityLabel={title} style={styles.marker}>
      <Text style={styles.markerText}>{title}</Text>
      {coordinate ? <Text style={styles.markerCoordinates}>{coordinate.latitude.toFixed(4)}, {coordinate.longitude.toFixed(4)}</Text> : null}
    </View>
  );
}

export function Callout({ children }: { children?: React.ReactNode }): React.ReactElement {
  return <View style={styles.callout}>{children}</View>;
}

export function Circle(): React.ReactElement {
  return <View accessible accessibilityLabel="Service radius overlay" style={styles.radius} />;
}

export function Polyline(): React.ReactElement { return <View accessible accessibilityLabel="Route overlay" />; }
export function Polygon(): React.ReactElement { return <View accessible accessibilityLabel="Area overlay" />; }

const styles = StyleSheet.create({
  box: { minHeight: 200, alignItems: 'center', justifyContent: 'center', backgroundColor: '#e8eef0', padding: 16 },
  title: { fontWeight: '600', color: '#0f766e', marginBottom: 4 },
  sub: { color: '#475569', fontSize: 12, textAlign: 'center' },
  coordinates: { color: '#334155', fontSize: 11, marginTop: 6 },
  children: { width: '100%', alignItems: 'center', marginTop: 10 },
  marker: { alignItems: 'center', borderRadius: 6, backgroundColor: '#ffffff', paddingHorizontal: 8, paddingVertical: 4, marginTop: 6 },
  markerText: { color: '#003d9b', fontSize: 11, fontWeight: '600' },
  markerCoordinates: { color: '#475569', fontSize: 10, marginTop: 2 },
  callout: { marginTop: 4 },
  radius: { height: 18, width: 72, borderRadius: 36, borderWidth: 1, borderColor: '#003d9b', backgroundColor: 'rgba(0,61,155,0.12)' },
});

export default MapView;
