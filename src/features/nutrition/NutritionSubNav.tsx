import { ScrollView } from 'react-native';
import { useRouter } from 'expo-router';

import { Chip } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';

export type NutritionSection = 'today' | 'recipes' | 'meal-plan' | 'shopping-list';

const SECTIONS: readonly { id: NutritionSection; label: string; href: string }[] = [
  { id: 'today', label: 'Today', href: '/nutrition' },
  { id: 'recipes', label: 'Recipes', href: '/nutrition/recipes' },
  { id: 'meal-plan', label: 'Meal Plan', href: '/nutrition/meal-plan' },
  { id: 'shopping-list', label: 'Shopping List', href: '/nutrition/shopping-list' },
];

/**
 * Sub-navigation for the nutrition area (CLAUDE.md §4).
 *
 * All four destinations exist from the start, even though three of them are
 * still placeholders — the information architecture is part of the product, and
 * hiding sections until their phase lands would mean rebuilding navigation
 * three more times.
 */
export function NutritionSubNav({ active }: { active: NutritionSection }) {
  const theme = useTheme();
  const router = useRouter();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: theme.spacing.sm, paddingRight: theme.spacing.xl }}
    >
      {SECTIONS.map((section) => (
        <Chip
          key={section.id}
          label={section.label}
          selected={section.id === active}
          onPress={() => {
            if (section.id !== active) router.push(section.href as never);
          }}
        />
      ))}
    </ScrollView>
  );
}
