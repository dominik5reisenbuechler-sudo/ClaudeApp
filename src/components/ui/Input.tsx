import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import type { TextInputProps, ViewStyle } from 'react-native';

import { Text } from './Text';
import { useTheme } from '@/theme/ThemeProvider';

interface BaseInputProps extends Omit<TextInputProps, 'style' | 'onChangeText' | 'value'> {
  label?: string;
  /** Validation message. Its presence is what puts the field in an error state. */
  error?: string;
  hint?: string;
  /** Fixed text after the value: `kg`, `cm`, `steps`. */
  suffix?: string;
  containerStyle?: ViewStyle;
}

interface InputProps extends BaseInputProps {
  value: string;
  onChangeText: (value: string) => void;
}

export function Input({
  label,
  error,
  hint,
  suffix,
  containerStyle,
  value,
  onChangeText,
  ...rest
}: InputProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  const borderColor = error
    ? theme.colors.danger
    : focused
      ? theme.colors.accent
      : theme.colors.border;

  return (
    <View style={[{ gap: theme.spacing.sm }, containerStyle]}>
      {label ? (
        <Text variant="caption" tone="secondary">
          {label}
        </Text>
      ) : null}

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: theme.colors.surfaceElevated,
          borderRadius: theme.radii.md,
          borderWidth: 1,
          borderColor,
          paddingHorizontal: theme.spacing.lg,
          minHeight: 52,
        }}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholderTextColor={theme.colors.textTertiary}
          accessibilityLabel={label}
          style={{
            flex: 1,
            color: theme.colors.textPrimary,
            fontSize: theme.fontSize.lg,
            paddingVertical: theme.spacing.md,
          }}
          {...rest}
        />
        {suffix ? (
          <Text variant="body" tone="tertiary">
            {suffix}
          </Text>
        ) : null}
      </View>

      {error ? (
        <Text variant="caption" tone="danger">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="tertiary">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

interface NumberInputProps extends BaseInputProps {
  value: number | null;
  onChangeValue: (value: number | null) => void;
  /** Decimal places allowed. 0 forces integers. */
  precision?: number;
}

/**
 * Numeric entry that keeps its own text state.
 *
 * Deriving the text from the number would make "82." unrepresentable, so the
 * user could not type a decimal point — the field would erase it on every
 * keystroke. Instead the text is authoritative while focused and the parsed
 * number is pushed up.
 */
export function NumberInput({
  value,
  onChangeValue,
  precision = 1,
  ...rest
}: NumberInputProps) {
  const [text, setText] = useState(() => (value === null ? '' : String(value)));

  const handleChange = (next: string) => {
    // Accept both separators; users type whichever their keyboard offers.
    const normalized = next.replace(',', '.');
    const pattern = precision === 0 ? /^\d*$/ : /^\d*\.?\d*$/;
    if (!pattern.test(normalized)) return;

    setText(normalized);

    if (normalized === '' || normalized === '.') {
      onChangeValue(null);
      return;
    }
    const parsed = Number.parseFloat(normalized);
    onChangeValue(Number.isFinite(parsed) ? parsed : null);
  };

  return (
    <Input
      value={text}
      onChangeText={handleChange}
      keyboardType={precision === 0 ? 'number-pad' : 'decimal-pad'}
      inputMode={precision === 0 ? 'numeric' : 'decimal'}
      {...rest}
    />
  );
}

interface SearchInputProps extends Omit<InputProps, 'label'> {
  onClear?: () => void;
}

export function SearchInput({ onClear, value, onChangeText, ...rest }: SearchInputProps) {
  const theme = useTheme();

  return (
    <View style={{ position: 'relative', justifyContent: 'center' }}>
      <Input
        value={value}
        onChangeText={onChangeText}
        placeholder="Search"
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel="Search"
        {...rest}
      />
      {value.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          onPress={() => {
            onChangeText('');
            onClear?.();
          }}
          style={{ position: 'absolute', right: theme.spacing.lg }}
        >
          <Text tone="tertiary">✕</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
