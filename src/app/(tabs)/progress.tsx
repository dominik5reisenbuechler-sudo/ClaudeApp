import { Screen, ScreenHeader } from '@/components/layout';
import { EmptyState } from '@/components/ui';

/** Placeholder for phase 7. See `docs/MVP_PLAN.md`. */
export default function ProgressScreen() {
  return (
    <Screen>
      <ScreenHeader
        title="Progress"
        subtitle="Bodyweight, measurements, strength and consistency."
      />
      <EmptyState
        title="Coming in phase 7"
        message="Weight-trend analysis is already implemented and tested in the domain layer — this screen is where it becomes visible, alongside measurements, personal records and weekly volume."
      />
    </Screen>
  );
}
