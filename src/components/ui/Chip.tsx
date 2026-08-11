import { Pressable, View } from 'react-native';

import { Text } from './Text';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH_SIZE } from '@/theme/tokens';

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
}

export function Chip({ label, selected = false, onPress, disabled = false }: ChipProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.md,
        borderRadius: theme.radii.pill,
        borderWidth: 1,
        borderColor: selected ? theme.colors.accent : theme.colors.border,
        backgroundColor: selected ? theme.colors.accentMuted : theme.colors.surfaceElevated,
        opacity: disabled ? 0.4 : pressed ? 0.8 : 1,
      })}
    >
      <Text variant="caption" tone={selected ? 'accent' : 'secondary'}>
        {label}
      </Text>
    </Pressable>
  );
}

interface OptionCardProps {
  title: string;
  description?: string;
  selected?: boolean;
  onPress: () => void;
  /** Short trailing text: a value, a count, a badge. */
  trailing?: string;
}

/**
 * The single-choice row used throughout onboarding. Large touch target,
 * description in place of a tooltip, and selection shown by border + label
 * colour rather than a checkbox glyph alone.
 */
export function OptionCard({
  title,
  description,
  selected = false,
  onPress,
  trailing,
}: OptionCardProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.lg,
        minHeight: MIN_TOUCH_SIZE + theme.spacing.lg,
        padding: theme.spacing.lg,
        borderRadius: theme.radii.lg,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? theme.colors.accent : theme.colors.border,
        backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.surface,
      })}
    >
      <View style={{ flex: 1, gap: theme.spacing.xs }}>
        <Text variant="bodyStrong" tone={selected ? 'accent' : 'primary'}>
          {title}
        </Text>
        {description ? (
          <Text variant="caption" tone="secondary">
            {description}
          </Text>
        ) : null}
      </View>
      {trailing ? (
        <Text variant="caption" tone="tertiary">
          {trailing}
        </Text>
      ) : null}
    </Pressable>
  );
}

interface StepperProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}

/** Discrete numeric choice — training days, meals per day. */
export function Stepper({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
}: StepperProps) {
  const theme = useTheme();

  const button = (glyph: string, next: number, enabled: boolean, hint: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hint}
      disabled={!enabled}
      onPress={() => onChange(next)}
      style={{
        width: MIN_TOUCH_SIZE,
        height: MIN_TOUCH_SIZE,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radii.md,
        backgroundColor: theme.colors.surfaceElevated,
        borderWidth: 1,
        borderColor: theme.colors.border,
        opacity: enabled ? 1 : 0.35,
      }}
    >
      <Text variant="heading">{glyph}</Text>
    </Pressable>
  );

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <Text variant="caption" tone="secondary">
        {label}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.lg }}>
        {button('−', Math.max(min, value - step), value > min, `Decrease ${label}`)}
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text variant="title">
            {value}
            {suffix ? (
              <Text variant="body" tone="tertiary">
                {' '}
                {suffix}
              </Text>
            ) : null}
          </Text>
        </View>
        {button('+', Math.min(max, value + step), value < max, `Increase ${label}`)}
      </View>
    </View>
  );
}
