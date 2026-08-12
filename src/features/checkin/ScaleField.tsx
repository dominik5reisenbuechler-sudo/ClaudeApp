import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';

interface ScaleFieldProps {
  label: string;
  /** What the low and high ends actually mean, so the number is not a guess. */
  lowLabel: string;
  highLabel: string;
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
}

/**
 * A 1–5 (or 0–4) answer.
 *
 * Selecting the current value again clears it, and cleared means *skipped* —
 * the engine excludes unanswered questions rather than treating them as a
 * middling 3. That is why the ends are labelled: a scale with no anchors gets
 * answered differently every week, which makes the trend meaningless.
 */
export function ScaleField({
  label,
  lowLabel,
  highLabel,
  value,
  onChange,
  min = 1,
  max = 5,
}: ScaleFieldProps) {
  const theme = useTheme();
  const options = Array.from({ length: max - min + 1 }, (_, index) => min + index);

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text variant="caption">{label}</Text>
        {value === null ? (
          <Text variant="caption" tone="tertiary">
            Skipped
          </Text>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        {options.map((option) => {
          const selected = value === option;
          return (
            <Pressable
              key={option}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`${label}: ${option}`}
              onPress={() => onChange(selected ? null : option)}
              style={{
                flex: 1,
                height: 44,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: theme.radii.md,
                borderWidth: 1,
                borderColor: selected ? theme.colors.accent : theme.colors.border,
                backgroundColor: selected ? theme.colors.accentMuted : theme.colors.surface,
              }}
            >
              <Text variant="mono" tone={selected ? 'accent' : 'secondary'}>
                {option}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text variant="caption" tone="tertiary">
          {lowLabel}
        </Text>
        <Text variant="caption" tone="tertiary">
          {highLabel}
        </Text>
      </View>
    </View>
  );
}
