import type { OnboardingStep } from '../schema';

/** Contract every onboarding step screen implements. */
export interface StepScreenProps {
  step: OnboardingStep;
  onNext: () => void;
  onBack?: () => void;
}
