/**
 * The shape of a recommendation (CLAUDE.md §53).
 *
 * Every recommendation carries what it would change, what it would change it
 * to, why, and how much the engine trusts itself. A recommendation without a
 * reason is a bug — the reason is what lets a user disagree with it, and being
 * able to disagree is what makes it worth trusting.
 *
 * Nothing here mutates anything. A recommendation is a proposal; the user
 * accepts or rejects it, and only acceptance changes their targets.
 */

import type { RecommendationType } from '@/types/domain';

export type { RecommendationType };

export interface Recommendation {
  type: RecommendationType;
  /** What it is now. Shape depends on `type`. */
  currentValue: Record<string, unknown>;
  /** What it would become. Empty for `no_change` and `adherence`. */
  suggestedValue: Record<string, unknown>;
  /** Built from the user's real numbers. Never a template. */
  reason: string;
  /** 0–1. How much the underlying data supports this. */
  confidence: number;
  /** `evidence_rules.rule_key` values this rests on. */
  evidenceRuleIds: string[];
}

export const RECOMMENDATION_TITLES: Record<RecommendationType, string> = {
  calorie_adjustment: 'Adjust your calories',
  macro_adjustment: 'Adjust your macros',
  volume_adjustment: 'Adjust your training volume',
  deload: 'Take a deload week',
  exercise_progression: 'Progress an exercise',
  adherence: 'Consistency first',
  no_change: 'No changes needed',
};
