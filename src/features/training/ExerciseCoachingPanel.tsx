import { Linking, View } from 'react-native';

import { Button, Callout, Text } from '@/components/ui';
import { coachingFor, demoFor } from '@/domain/training/exerciseMedia';
import { useTheme } from '@/theme/ThemeProvider';
import type { ExerciseRow } from '@/types/database';

/**
 * How to perform an exercise: the written cues, and a way to watch one.
 *
 * The two halves make different promises and the UI says which is which. A
 * `video` is a specific clip the catalogue vouches for; a `search` is an offer
 * to go and find one. Presenting a search result as though the app had chosen
 * it would put the app's authority behind whatever happens to rank first today
 * — see `demoFor` in domain/training/exerciseMedia.ts for why the fallback is
 * a search rather than a hard-coded id.
 */
export function ExerciseCoachingPanel({
  exercise,
}: {
  exercise: Pick<ExerciseRow, 'name' | 'instructions' | 'common_mistakes' | 'rom_notes' | 'video_url'>;
}) {
  const theme = useTheme();
  const coaching = coachingFor(exercise);
  const demo = demoFor({ name: exercise.name, videoUrl: exercise.video_url });

  return (
    <View style={{ gap: theme.spacing.lg }}>
      {coaching.instructions.length > 0 ? (
        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="label" tone="tertiary">
            How to do it
          </Text>
          {coaching.instructions.map((step, index) => (
            <View key={step} style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              <Text variant="mono" tone="tertiary">
                {index + 1}
              </Text>
              <Text variant="caption" tone="secondary" style={{ flex: 1 }}>
                {step}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {coaching.commonMistakes.length > 0 ? (
        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="label" tone="tertiary">
            What usually goes wrong
          </Text>
          {coaching.commonMistakes.map((mistake) => (
            <View key={mistake} style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              <Text variant="caption" tone="tertiary">
                ·
              </Text>
              <Text variant="caption" tone="secondary" style={{ flex: 1 }}>
                {mistake}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {coaching.romNotes ? (
        <Callout tone="info" title="Range of motion">
          <Text variant="caption" tone="secondary">
            {coaching.romNotes}
          </Text>
        </Callout>
      ) : null}

      <View style={{ gap: theme.spacing.xs }}>
        <Button
          label={demo.kind === 'video' ? 'Watch the demonstration' : 'Find a demonstration'}
          variant="ghost"
          size="sm"
          onPress={() => void Linking.openURL(demo.url)}
        />
        <Text variant="caption" tone="tertiary">
          {demo.kind === 'video'
            ? 'Opens the clip this exercise links to on YouTube.'
            : 'Opens a YouTube search for this exercise, filtered towards short clips. We do not link a specific video unless one has been checked.'}
        </Text>
      </View>
    </View>
  );
}
