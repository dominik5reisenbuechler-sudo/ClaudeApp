import { View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { clamp } from '@/utils/number';

interface ProgressBarProps {
  /** Current value in the same unit as `target`. */
  value: number;
  target: number;
  color?: string;
  height?: number;
  /**
   * When true, progress past 100% is drawn in a warning colour rather than
   * simply stopping at full — going 400 kcal over is information the user needs
   * to see, not something to hide behind a full bar.
   */
  showOvershoot?: boolean;
  accessibilityLabel?: string;
}

export function ProgressBar({
  value,
  target,
  color,
  height = 8,
  showOvershoot = true,
  accessibilityLabel,
}: ProgressBarProps) {
  const theme = useTheme();

  const ratio = target > 0 ? value / target : 0;
  const isOver = showOvershoot && ratio > 1;
  const fillRatio = clamp(ratio, 0, 1);

  const fillColor = isOver ? theme.colors.warning : (color ?? theme.colors.accent);

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: target, now: value }}
      style={{
        height,
        borderRadius: height / 2,
        backgroundColor: theme.colors.track,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          width: `${fillRatio * 100}%`,
          height: '100%',
          borderRadius: height / 2,
          backgroundColor: fillColor,
        }}
      />
    </View>
  );
}
