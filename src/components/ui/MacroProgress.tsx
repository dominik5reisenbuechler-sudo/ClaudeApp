import { View } from 'react-native';

import { ProgressBar } from './ProgressBar';
import { Text } from './Text';
import { useTheme } from '@/theme/ThemeProvider';

export type MacroKind = 'energy' | 'protein' | 'carbs' | 'fat' | 'fiber';

interface MacroProgressProps {
  kind: MacroKind;
  label: string;
  consumed: number;
  target: number;
  unit?: string;
  /** Show "N left" / "N over" beneath the bar. */
  showRemaining?: boolean;
}

/**
 * The canonical "142 / 175 g" readout. Used identically on the dashboard, the
 * nutrition screen and the recipe recommender, so a user learns one pattern
 * rather than three.
 */
export function MacroProgress({
  kind,
  label,
  consumed,
  target,
  unit = 'g',
  showRemaining = true,
}: MacroProgressProps) {
  const theme = useTheme();

  const colorByKind: Record<MacroKind, string> = {
    energy: theme.colors.accent,
    protein: theme.colors.protein,
    carbs: theme.colors.carbs,
    fat: theme.colors.fat,
    fiber: theme.colors.fiber,
  };

  const remaining = target - consumed;
  const isOver = remaining < 0;

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text variant="caption" tone="secondary">
          {label}
        </Text>
        <Text variant="mono">
          {formatNumber(consumed)}
          <Text variant="mono" tone="tertiary">
            {' / '}
            {formatNumber(target)}
            {unit ? ` ${unit}` : ''}
          </Text>
        </Text>
      </View>

      <ProgressBar
        value={consumed}
        target={target}
        color={colorByKind[kind]}
        accessibilityLabel={`${label}: ${formatNumber(consumed)} of ${formatNumber(target)} ${unit}`}
      />

      {showRemaining ? (
        <Text variant="caption" tone={isOver ? 'warning' : 'tertiary'}>
          {isOver
            ? `${formatNumber(Math.abs(remaining))}${unit ? ` ${unit}` : ''} over`
            : `${formatNumber(remaining)}${unit ? ` ${unit}` : ''} left`}
        </Text>
      ) : null}
    </View>
  );
}

function formatNumber(value: number): string {
  const rounded = Math.round(value);
  return rounded.toLocaleString('en-US');
}
