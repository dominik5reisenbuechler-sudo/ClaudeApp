import { useState } from 'react';
import { View } from 'react-native';

import { BottomSheet, Button, Callout, NumberInput, Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';

interface LogValueSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  label: string;
  suffix?: string;
  precision?: number;
  /** Pre-fills the field when a value for today already exists. */
  initialValue: number | null;
  min: number;
  max: number;
  hint?: string;
  onSave: (value: number) => Promise<void>;
}

/**
 * A single-number entry sheet, shared by weight and step logging.
 *
 * The two flows differ only in units, bounds and copy, so they share one
 * component. Anything that behaves differently — validation messages, the
 * saving state, dismissal — then behaves identically in both.
 */
export function LogValueSheet(props: LogValueSheetProps) {
  return (
    <BottomSheet visible={props.visible} onClose={props.onClose} title={props.title}>
      {/* Remounted on each open so the field starts from the current value
          rather than whatever was typed and abandoned last time. */}
      {props.visible ? <SheetBody {...props} /> : null}
    </BottomSheet>
  );
}

function SheetBody({
  onClose,
  label,
  suffix,
  precision = 1,
  initialValue,
  min,
  max,
  hint,
  onSave,
}: LogValueSheetProps) {
  const theme = useTheme();
  const [value, setValue] = useState<number | null>(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (value === null) {
      setError('Please enter a value');
      return;
    }
    if (value < min || value > max) {
      setError(`Enter a value between ${min} and ${max}${suffix ? ` ${suffix}` : ''}`);
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      await onSave(value);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <NumberInput
        label={label}
        value={value}
        onChangeValue={(next) => {
          setValue(next);
          setError(null);
        }}
        precision={precision}
        autoFocus
        {...(suffix ? { suffix } : {})}
        {...(hint ? { hint } : {})}
      />

      {error ? (
        <Callout tone="danger">
          <Text variant="caption" tone="danger">
            {error}
          </Text>
        </Callout>
      ) : null}

      <Button label="Save" loading={isSaving} onPress={() => void handleSave()} />
    </View>
  );
}
