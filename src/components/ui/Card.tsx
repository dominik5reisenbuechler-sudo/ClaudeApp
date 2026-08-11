import { Pressable, View } from 'react-native';
import type { ViewProps, ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

interface CardProps extends ViewProps {
  /** `flat` sits directly on the background; `raised` reads as a container. */
  tone?: 'raised' | 'flat' | 'accent';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  onPress?: () => void;
  style?: ViewStyle;
}

export function Card({
  tone = 'raised',
  padding = 'lg',
  onPress,
  style,
  children,
  ...rest
}: CardProps) {
  const theme = useTheme();

  const paddingValue =
    padding === 'none'
      ? 0
      : padding === 'sm'
        ? theme.spacing.md
        : padding === 'md'
          ? theme.spacing.lg
          : theme.spacing.xl;

  const backgroundColor =
    tone === 'accent'
      ? theme.colors.accentMuted
      : tone === 'flat'
        ? 'transparent'
        : theme.colors.surface;

  const containerStyle: ViewStyle = {
    backgroundColor,
    borderRadius: theme.radii.lg,
    padding: paddingValue,
    borderWidth: tone === 'flat' ? 0 : 1,
    borderColor: tone === 'accent' ? theme.colors.accent : theme.colors.border,
  };

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [
          containerStyle,
          pressed ? { backgroundColor: theme.colors.surfacePressed } : null,
          style,
        ]}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <View style={[containerStyle, style]} {...rest}>
      {children}
    </View>
  );
}
