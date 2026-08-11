import { View } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';

import { LoadingState } from '@/components/ui';
import { useOnboardingDraft } from '@/features/onboarding/draft';
import { isOnboardingStep, nextStep, previousStep } from '@/features/onboarding/schema';
import { STEP_COMPONENTS } from '@/features/onboarding/steps';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * One route for the whole flow, resolving the step from the URL.
 *
 * Thirteen near-identical route files would each need the same wiring — draft
 * access, next/previous, progress — and would drift. Here the order lives in
 * `ONBOARDING_STEPS` and the components in `STEP_COMPONENTS`, both of which the
 * compiler keeps in agreement.
 */
export default function OnboardingStepRoute() {
  const theme = useTheme();
  const router = useRouter();
  const { step } = useLocalSearchParams<{ step: string }>();
  const { isHydrated } = useOnboardingDraft();

  if (!step || !isOnboardingStep(step)) return <Redirect href="/welcome" />;

  // Rendering a step before the saved draft is loaded would mount its form with
  // empty defaults and then discard the restored answers on the next write.
  if (!isHydrated) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, justifyContent: 'center' }}>
        <LoadingState label="Restoring your answers…" />
      </View>
    );
  }

  const StepComponent = STEP_COMPONENTS[step];
  const previous = previousStep(step);

  const goNext = () => {
    const next = nextStep(step);
    if (next) router.push(`/${next}`);
  };

  return (
    <StepComponent
      step={step}
      onNext={goNext}
      {...(previous ? { onBack: () => router.back() } : {})}
    />
  );
}
