import { useState } from 'react';
import { View } from 'react-native';

import { Button, Callout, Card, Text } from '@/components/ui';
import { confidenceBand } from '@/domain/nutrition/tdeeEstimator';
import { RECOMMENDATION_TITLES } from '@/domain/recommendations/types';
import type { Recommendation } from '@/domain/recommendations/types';
import { useEvidenceRules } from '@/hooks/useCheckin';
import { useTheme } from '@/theme/ThemeProvider';

interface RecommendationCardProps {
  recommendation: Recommendation;
  /** Omitted for the preview, where there is nothing to accept yet. */
  onAccept?: () => void;
  onReject?: () => void;
  isResponding?: boolean;
}

/**
 * One recommendation, with its reasoning shown by default.
 *
 * The reason is not behind a "why?" link. A recommendation the user has to dig
 * for the justification of is one they will either follow blindly or ignore,
 * and neither is what we want (CLAUDE.md §44). The *evidence* behind the
 * reasoning — the rules and their sources — is one tap away, because that is
 * reference material rather than the argument itself.
 */
export function RecommendationCard({
  recommendation,
  onAccept,
  onReject,
  isResponding = false,
}: RecommendationCardProps) {
  const theme = useTheme();
  const [showEvidence, setShowEvidence] = useState(false);
  const rules = useEvidenceRules(showEvidence ? recommendation.evidenceRuleIds : []);

  const isActionable = recommendation.type !== 'no_change' && recommendation.type !== 'adherence';
  const band = confidenceBand(recommendation.confidence);

  return (
    <Card>
      <View style={{ gap: theme.spacing.md }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.md }}>
          <Text variant="heading" style={{ flex: 1 }}>
            {RECOMMENDATION_TITLES[recommendation.type]}
          </Text>
          <Text variant="caption" tone={band === 'high' ? 'success' : 'tertiary'}>
            {CONFIDENCE_LABELS[band]}
          </Text>
        </View>

        {summarize(recommendation) ? (
          <Text variant="title" tone="accent">
            {summarize(recommendation)}
          </Text>
        ) : null}

        <Text variant="body" tone="secondary">
          {recommendation.reason}
        </Text>

        {recommendation.evidenceRuleIds.length > 0 ? (
          <Button
            label={showEvidence ? 'Hide the evidence' : 'What is this based on?'}
            variant="ghost"
            size="sm"
            fullWidth={false}
            onPress={() => setShowEvidence((open) => !open)}
          />
        ) : null}

        {showEvidence ? (
          <Callout tone="info" title="Evidence">
            {rules.isLoading ? (
              <Text variant="caption" tone="tertiary">
                Loading…
              </Text>
            ) : (rules.data ?? []).length === 0 ? (
              <Text variant="caption" tone="tertiary">
                {recommendation.evidenceRuleIds.join(', ')}
              </Text>
            ) : (
              <View style={{ gap: theme.spacing.sm }}>
                {(rules.data ?? []).map((rule) => (
                  <View key={rule.id} style={{ gap: 2 }}>
                    <Text variant="caption">{rule.recommendation}</Text>
                    <Text variant="caption" tone="tertiary">
                      {EVIDENCE_LABELS[rule.evidence_level]}
                      {rule.source_title ? ` · ${rule.source_title}` : ''}
                      {rule.publication_year ? ` (${rule.publication_year})` : ''}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </Callout>
        ) : null}

        {isActionable && onAccept && onReject ? (
          <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
            <Button
              label="Apply it"
              onPress={onAccept}
              loading={isResponding}
              style={{ flex: 1 }}
            />
            <Button
              label="Not now"
              variant="secondary"
              onPress={onReject}
              disabled={isResponding}
              style={{ flex: 1 }}
            />
          </View>
        ) : null}
      </View>
    </Card>
  );
}

const CONFIDENCE_LABELS: Record<ReturnType<typeof confidenceBand>, string> = {
  insufficient: 'Not enough data',
  low: 'Low confidence',
  moderate: 'Moderate confidence',
  high: 'High confidence',
};

const EVIDENCE_LABELS: Record<string, string> = {
  strong: 'Strong evidence',
  moderate: 'Moderate evidence',
  limited: 'Limited evidence',
  mechanistic: 'Reasoned from physiology',
};

/** The headline change, when there is one. Never invented for a `no_change`. */
function summarize(recommendation: Recommendation): string | null {
  const suggested = recommendation.suggestedValue;

  if (recommendation.type === 'calorie_adjustment') {
    const kcal = suggested.energyKcal;
    const delta = suggested.deltaKcal;
    if (typeof kcal !== 'number' || typeof delta !== 'number') return null;
    return `${kcal.toLocaleString('en-US')} kcal (${delta > 0 ? '+' : '−'}${Math.abs(delta)})`;
  }

  if (recommendation.type === 'volume_adjustment') {
    const sets = suggested.weeklySets;
    const sessions = suggested.sessionsPerWeek;
    if (typeof sessions === 'number' && typeof sets === 'number') {
      return `${sets} sets across ${sessions} sessions`;
    }
    if (typeof sets === 'number') return `${sets} sets a week`;
    return null;
  }

  if (recommendation.type === 'deload') {
    const percent = suggested.volumePercent;
    if (typeof percent !== 'number') return null;
    return `One week at ${percent}% volume`;
  }

  return null;
}
