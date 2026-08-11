import { View } from 'react-native';

import { Chip, OptionCard, Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Selection controls shared by the onboarding steps.
 *
 * Generic over the option value so a step passes its own literal union and gets
 * a correctly-typed `onChange` — no string casts at the call site.
 */

export interface Option<T extends string> {
  value: T;
  label: string;
  description?: string;
}

interface SingleSelectProps<T extends string> {
  label?: string;
  options: readonly Option<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
  error?: string;
}

export function SingleSelect<T extends string>({
  label,
  options,
  value,
  onChange,
  error,
}: SingleSelectProps<T>) {
  const theme = useTheme();

  return (
    <View style={{ gap: theme.spacing.md }}>
      {label ? (
        <Text variant="caption" tone="secondary">
          {label}
        </Text>
      ) : null}
      {options.map((option) => (
        <OptionCard
          key={option.value}
          title={option.label}
          {...(option.description ? { description: option.description } : {})}
          selected={value === option.value}
          onPress={() => onChange(option.value)}
        />
      ))}
      {error ? (
        <Text variant="caption" tone="danger">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

interface MultiSelectProps<T extends string> {
  label?: string;
  options: readonly Option<T>[];
  values: readonly T[];
  onChange: (values: T[]) => void;
  error?: string;
}

export function MultiSelect<T extends string>({
  label,
  options,
  values,
  onChange,
  error,
}: MultiSelectProps<T>) {
  const theme = useTheme();

  const toggle = (value: T) => {
    onChange(values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);
  };

  return (
    <View style={{ gap: theme.spacing.md }}>
      {label ? (
        <Text variant="caption" tone="secondary">
          {label}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
        {options.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            selected={values.includes(option.value)}
            onPress={() => toggle(option.value)}
          />
        ))}
      </View>
      {error ? (
        <Text variant="caption" tone="danger">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

interface ToggleRowProps {
  label: string;
  description?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}

/**
 * A yes/no question rendered as two explicit options rather than a switch.
 *
 * For screening questions this matters: a switch defaulting to "off" is
 * indistinguishable from an unanswered question, and these answers gate safety
 * behaviour.
 */
export function ToggleRow({ label, description, value, onChange }: ToggleRowProps) {
  const theme = useTheme();

  return (
    <View style={{ gap: theme.spacing.md }}>
      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="bodyStrong">{label}</Text>
        {description ? (
          <Text variant="caption" tone="secondary">
            {description}
          </Text>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        <Chip label="No" selected={value === false} onPress={() => onChange(false)} />
        <Chip label="Yes" selected={value === true} onPress={() => onChange(true)} />
      </View>
    </View>
  );
}
