import { useMemo } from 'react';
import { View } from 'react-native';

import { Card, Text } from '@/components/ui';
import { xpByKind, PERFECT_DAY_KINDS, XP_AWARDS, XP_LABELS } from '@/domain/gamification/xp';
import { useRecentXpEvents } from '@/hooks/useGamification';
import { useTheme } from '@/theme/ThemeProvider';
import type { XpKind } from '@/types/domain';

/**
 * What earns XP, and what it has earned lately.
 *
 * The value of this screen is not the totals — it is that the list exists at
 * all. A points system whose rules are invisible teaches people to guess at
 * them, and guessing at a reward is how someone ends up gaming the log instead
 * of doing the training. Everything that pays is stated, with its rate.
 *
 * The ordering is by what a day can actually earn, not by what this user
 * happens to have earned, so an empty account still shows the whole set.
 */

/** Every kind a day can earn, in the order the list reads best. */
const DAILY: readonly XpKind[] = [
  'workout_completed',
  'calorie_target',
  'protein_target',
  'step_goal',
  'weight_logged',
  'perfect_day',
];

const PERIODIC: readonly XpKind[] = ['meal_plan', 'checkin_completed'];

export function XpBreakdown({ days = 30 }: { days?: number }) {
  const theme = useTheme();
  const events = useRecentXpEvents(days);

  const earned = useMemo(
    () =>
      xpByKind(
        (events.data ?? []).map((row) => ({
          kind: row.kind,
          xp: row.xp,
          earnedOn: row.earned_on,
          context: {},
        })),
      ),
    [events.data],
  );

  return (
    <View style={{ gap: theme.spacing.md }}>
      <Card>
        <View style={{ gap: theme.spacing.md }}>
          <Text variant="label" tone="tertiary">
            Every day
          </Text>

          {DAILY.map((kind) => (
            <Row key={kind} kind={kind} earnedXp={earned[kind] ?? 0} />
          ))}

          <Text variant="caption" tone="tertiary">
            {`The perfect-day bonus lands when all four of ${PERFECT_DAY_KINDS.map(
              (kind) => XP_LABELS[kind].toLowerCase(),
            ).join(', ')} happen on the same day. A workout is not required — a rest day is part of a programme, not a failure of one.`}
          </Text>
        </View>
      </Card>

      <Card>
        <View style={{ gap: theme.spacing.md }}>
          <Text variant="label" tone="tertiary">
            Every week
          </Text>
          {PERIODIC.map((kind) => (
            <Row key={kind} kind={kind} earnedXp={earned[kind] ?? 0} />
          ))}
        </View>
      </Card>

      <Text variant="caption" tone="tertiary">
        {`Earned in the last ${days} days is shown on the right. XP is encouragement and nothing else — no part of the calorie or training engine reads it, so points can never push a recommendation around.`}
      </Text>
    </View>
  );
}

function Row({ kind, earnedXp }: { kind: XpKind; earnedXp: number }) {
  const theme = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: theme.spacing.md,
      }}
    >
      <Text variant="caption" style={{ flex: 1 }}>
        {XP_LABELS[kind]}
      </Text>
      <Text variant="mono" tone="tertiary">
        {`+${XP_AWARDS[kind]}`}
      </Text>
      <Text variant="mono" tone={earnedXp > 0 ? 'secondary' : 'tertiary'}>
        {earnedXp > 0 ? earnedXp.toLocaleString('en-US') : '—'}
      </Text>
    </View>
  );
}
