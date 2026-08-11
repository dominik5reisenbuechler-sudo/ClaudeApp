import { Screen, ScreenHeader } from '@/components/layout';
import { EmptyState } from '@/components/ui';
import { NutritionSubNav } from '@/features/nutrition/NutritionSubNav';

/** Placeholder for phase 4. See `docs/MVP_PLAN.md`. */
export default function RecipesScreen() {
  return (
    <Screen>
      <ScreenHeader eyebrow="Nutrition" title="Recipes" />
      <NutritionSubNav active="recipes" />
      <EmptyState
        title="Coming in phase 4"
        message="High-protein recipes with portion scaling, and suggestions ranked against whatever macros you have left for the day. The remaining-macro maths this needs is already in place and tested."
      />
    </Screen>
  );
}
