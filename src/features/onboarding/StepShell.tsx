import { View } from 'react-native';

import { stepProgress } from './schema';
import type { OnboardingStep } from './schema';
import { Screen, ScreenHeader } from '@/components/layout';
import { Button, ProgressBar, Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';

interface StepShellProps {
  step: OnboardingStep;
  title: string;
  subtitle?: string;
  onBack?: () => void;
  onContinue: () => void;
  continueLabel?: string;
  isSubmitting?: boolean;
  /** Blocks continuing without a validation message — use sparingly. */
  continueDisabled?: boolean;
  children: React.ReactNode;
}

/**
 * Chrome shared by every onboarding step: progress, header, and a pinned
 * continue action.
 *
 * Steps supply only their own fields. Anything that appears on more than one
 * step belongs here, otherwise thirteen screens drift apart in spacing and
 * button placement.
 */
export function StepShell({
  step,
  title,
  subtitle,
  onBack,
  onContinue,
  continueLabel = 'Continue',
  isSubmitting = false,
  continueDisabled = false,
  children,
}: StepShellProps) {
  const theme = useTheme();
  const { index, total } = stepProgress(step);

  return (
    <Screen
      footer={
        <Button
          label={continueLabel}
          onPress={onContinue}
          loading={isSubmitting}
          disabled={continueDisabled}
        />
      }
    >
      <View style={{ gap: theme.spacing.sm }}>
        <ProgressBar
          value={index}
          target={total}
          height={4}
          showOvershoot={false}
          accessibilityLabel={`Step ${index} of ${total}`}
        />
        <Text variant="label" tone="tertiary">
          Step {index} of {total}
        </Text>
      </View>

      <ScreenHeader title={title} subtitle={subtitle} onBack={onBack} />

      <View style={{ gap: theme.spacing.xl }}>{children}</View>
    </Screen>
  );
}
