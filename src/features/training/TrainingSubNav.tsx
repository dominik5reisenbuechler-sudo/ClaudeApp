import { ScrollView } from 'react-native';
import { useRouter } from 'expo-router';

import { Chip } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';

export type TrainingSection = 'plan' | 'exercises' | 'history';

const SECTIONS: readonly { id: TrainingSection; label: string; href: string }[] = [
  { id: 'plan', label: 'Current Plan', href: '/training' },
  { id: 'exercises', label: 'Exercises', href: '/training/exercises' },
  { id: 'history', label: 'History', href: '/training/history' },
];

/**
 * Sub-navigation for the training area. "Workout" is not a tab: it is a state
 * you enter from the plan and leave when the session ends, so it lives on its
 * own route rather than as a destination you can wander into.
 */
export function TrainingSubNav({ active }: { active: TrainingSection }) {
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
