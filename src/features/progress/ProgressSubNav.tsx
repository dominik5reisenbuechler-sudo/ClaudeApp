import { ScrollView } from 'react-native';
import { useRouter } from 'expo-router';

import { Chip } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';

export type ProgressSection = 'body' | 'strength' | 'training' | 'checkin' | 'achievements';

const SECTIONS: readonly { id: ProgressSection; label: string; href: string }[] = [
  { id: 'body', label: 'Body', href: '/progress' },
  { id: 'strength', label: 'Strength', href: '/progress/strength' },
  { id: 'training', label: 'Training', href: '/progress/training' },
  { id: 'checkin', label: 'Check-in', href: '/progress/checkin' },
  { id: 'achievements', label: 'Achievements', href: '/progress/achievements' },
];

export function ProgressSubNav({ active }: { active: ProgressSection }) {
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
