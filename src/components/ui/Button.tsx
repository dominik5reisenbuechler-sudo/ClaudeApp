import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import type { PressableProps, ViewStyle } from 'react-native';

import { Text } from './Text';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH_SIZE } from '@/theme/tokens';
import type { Theme } from '@/theme/tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  /** Rendered before the label. Keep it to an icon or a small badge. */
  leading?: React.ReactNode;
  style?: ViewStyle;
}

const HEIGHTS: Record<ButtonSize, number> = { sm: 36, md: 48, lg: 56 };

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = true,
  leading,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled === true || loading;

  const { container, labelTone } = resolveVariant(theme, variant);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        container,
        {
          height: Math.max(HEIGHTS[size], MIN_TOUCH_SIZE),
          borderRadius: theme.radii.md,
          paddingHorizontal: theme.spacing.xl,
          opacity: isDisabled ? 0.45 : pressed ? 0.85 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={theme.colors[labelTone === 'onAccent' ? 'textOnAccent' : 'textPrimary']} />
      ) : (
        <View style={styles.content}>
          {leading ? <View style={{ marginRight: theme.spacing.sm }}>{leading}</View> : null}
          <Text variant="bodyStrong" tone={labelTone}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

function resolveVariant(
  theme: Theme,
  variant: ButtonVariant,
): { container: ViewStyle; labelTone: 'onAccent' | 'primary' | 'danger' } {
  const c = theme.colors;
  switch (variant) {
    case 'secondary':
      return {
        container: { backgroundColor: c.surfaceElevated, borderWidth: 1, borderColor: c.border },
        labelTone: 'primary',
      };
    case 'ghost':
      return { container: { backgroundColor: 'transparent' }, labelTone: 'primary' };
    case 'danger':
      return {
        container: { backgroundColor: c.dangerMuted, borderWidth: 1, borderColor: c.danger },
        labelTone: 'danger',
      };
    case 'primary':
    default:
      return { container: { backgroundColor: c.accent }, labelTone: 'onAccent' };
  }
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
