import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button, Card, ProgressBar, Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';

interface RestTimerProps {
  /** Prescribed rest for the exercise just performed. */
  seconds: number;
  /**
   * When the rest began, from `Date.now()`.
   *
   * Supplied by the caller rather than captured here, for two reasons: reading
   * the clock during render is impure, and the timer has to restart when the
   * *same* rest length is triggered again — which a `seconds` dependency alone
   * would not catch.
   */
  startedAtMs: number;
  onDismiss: () => void;
}

/**
 * Rest timer.
 *
 * Counts from a wall-clock start rather than by decrementing a counter each
 * tick: a phone that sleeps or throttles timers would otherwise under-count the
 * rest, and short rest measurably degrades the next set
 * (SCIENTIFIC_RULES.md §4.5).
 *
 * It keeps running past zero rather than stopping, because knowing you have
 * rested three and a half minutes is more useful than a timer that just says
 * "done".
 */
export function RestTimer({ seconds, startedAtMs, onDismiss }: RestTimerProps) {
  const theme = useTheme();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000)));

    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [startedAtMs]);

  const remaining = seconds - elapsed;
  const isOver = remaining <= 0;

  return (
    <Card tone={isOver ? 'accent' : 'raised'} padding="md">
      <View style={{ gap: theme.spacing.md }}>
        <View
          style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}
        >
          <Text variant="label" tone="tertiary">
            {isOver ? 'Rested' : 'Rest'}
          </Text>
          <Text variant="title" tone={isOver ? 'accent' : 'primary'}>
            {formatDuration(isOver ? elapsed : remaining)}
          </Text>
        </View>

        <ProgressBar
          value={Math.min(elapsed, seconds)}
          target={seconds}
          showOvershoot={false}
          accessibilityLabel={`${formatDuration(Math.abs(remaining))} ${isOver ? 'over' : 'remaining'}`}
        />

        <Text variant="caption" tone="secondary">
          {isOver
            ? 'Ready when you are. Longer rest is fine — cutting it short costs reps on the next set.'
            : `Prescribed rest is ${formatDuration(seconds)} for this lift.`}
        </Text>

        <Button label="Skip rest" variant="secondary" size="sm" onPress={onDismiss} />
      </View>
    </Card>
  );
}

function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${`${seconds}`.padStart(2, '0')}`;
}
