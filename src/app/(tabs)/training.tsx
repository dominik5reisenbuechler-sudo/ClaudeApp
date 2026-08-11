import { Screen, ScreenHeader } from '@/components/layout';
import { EmptyState } from '@/components/ui';

/**
 * Placeholder for phase 6. It states plainly that the feature is not built,
 * rather than showing a mocked-up plan that would be indistinguishable from a
 * broken one.
 */
export default function TrainingScreen() {
  return (
    <Screen>
      <ScreenHeader title="Training" subtitle="Current plan, workouts, exercises and history." />
      <EmptyState
        title="Coming in phase 6"
        message="The exercise database, plan generator, workout logger and progression engine are the next major build. The foundation they need — muscles, fractional set credits and the training schema — is designed in docs/DATABASE_SCHEMA.md."
      />
    </Screen>
  );
}
