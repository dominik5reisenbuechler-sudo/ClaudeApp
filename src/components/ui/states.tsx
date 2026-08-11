import { ActivityIndicator, View } from 'react-native';

import { Button } from './Button';
import { Text } from './Text';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Loading, empty and error states.
 *
 * Every query-backed screen renders exactly one of these or its content
 * (ARCHITECTURE.md §7). Screens must not invent their own spinner or error
 * copy — inconsistent error handling is how an app starts feeling unfinished.
 */

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  const theme = useTheme();
  return (
    <View style={{ padding: theme.spacing.xxl, alignItems: 'center', gap: theme.spacing.lg }}>
      <ActivityIndicator color={theme.colors.accent} />
      <Text variant="caption" tone="tertiary">
        {label}
      </Text>
    </View>
  );
}

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
}: ErrorStateProps) {
  const theme = useTheme();
  return (
    <View style={{ padding: theme.spacing.xxl, alignItems: 'center', gap: theme.spacing.lg }}>
      <Text variant="heading" align="center">
        {title}
      </Text>
      {message ? (
        <Text variant="caption" tone="secondary" align="center">
          {message}
        </Text>
      ) : null}
      {onRetry ? (
        <Button label="Try again" variant="secondary" fullWidth={false} onPress={onRetry} />
      ) : null}
    </View>
  );
}

interface EmptyStateProps {
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ title, message, actionLabel, onAction }: EmptyStateProps) {
  const theme = useTheme();
  return (
    <View style={{ padding: theme.spacing.xxl, alignItems: 'center', gap: theme.spacing.lg }}>
      <Text variant="heading" align="center">
        {title}
      </Text>
      {message ? (
        <Text variant="caption" tone="secondary" align="center">
          {message}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} variant="secondary" fullWidth={false} onPress={onAction} />
      ) : null}
    </View>
  );
}

interface CalloutProps {
  tone: 'info' | 'success' | 'warning' | 'danger';
  title?: string;
  children: React.ReactNode;
}

/** Inline notice. Used for safety messages and recommendation explanations. */
export function Callout({ tone, title, children }: CalloutProps) {
  const theme = useTheme();

  const background = {
    info: theme.colors.surfaceElevated,
    success: theme.colors.successMuted,
    warning: theme.colors.warningMuted,
    danger: theme.colors.dangerMuted,
  }[tone];

  const border = {
    info: theme.colors.border,
    success: theme.colors.success,
    warning: theme.colors.warning,
    danger: theme.colors.danger,
  }[tone];

  return (
    <View
      style={{
        backgroundColor: background,
        borderLeftWidth: 3,
        borderLeftColor: border,
        borderRadius: theme.radii.md,
        padding: theme.spacing.lg,
        gap: theme.spacing.sm,
      }}
    >
      {title ? <Text variant="bodyStrong">{title}</Text> : null}
      {typeof children === 'string' ? (
        <Text variant="caption" tone="secondary">
          {children}
        </Text>
      ) : (
        children
      )}
    </View>
  );
}
