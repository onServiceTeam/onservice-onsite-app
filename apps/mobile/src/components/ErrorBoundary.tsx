// A2 / C2 — top-level error boundary for the mobile app.
//
// Pre-fix: the mobile app had no error boundary. Sentry reported render
// crashes but did not recover them, so a single thrown error white-screened
// the whole app — catastrophic if it happened mid-checkout. (The admin app
// already has one.)
//
// Post-fix: a render error anywhere below this boundary shows a themed
// fallback ("Something went wrong") with a "Try again" button that resets the
// boundary and re-renders the subtree. The error is still reported to Sentry
// so we keep crash visibility while recovering the UI.

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { captureException } from '@sentry/core';
import { colors, spacing, typography, borderRadius } from '@/config/theme';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Recover the UI but keep crash visibility: report to Sentry with the
    // React component stack so the crash is still actionable.
    captureException(error, {
      extra: { componentStack: info.componentStack ?? undefined },
    });
  }

  private handleReset = (): void => {
    this.setState({ hasError: false });
  };

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <View style={styles.container} accessibilityRole="alert">
        <Text style={styles.title} accessibilityRole="header">
          Something went wrong
        </Text>
        <Text style={styles.body}>
          The app ran into an unexpected problem. You can try again. If it keeps
          happening, please close and reopen the app.
        </Text>
        <TouchableOpacity
          style={styles.button}
          onPress={this.handleReset}
          accessibilityRole="button"
          accessibilityLabel="Try again"
        >
          <Text style={styles.buttonText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: colors.background,
  },
  title: {
    ...typography.h2,
    color: colors.text,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  body: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  button: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.lg,
  },
  buttonText: {
    ...typography.button,
    color: colors.white,
  },
});

export default ErrorBoundary;
