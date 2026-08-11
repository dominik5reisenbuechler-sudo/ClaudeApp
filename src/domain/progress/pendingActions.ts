/**
 * The dashboard's "still to do" list.
 *
 * An action appears only when it is genuinely actionable *right now*. Two
 * consequences worth stating, because both are easy to get wrong:
 *
 *   1. Features that do not exist yet contribute nothing. `nutrition` and
 *      `workout` are nullable, and a null means "this capability is not
 *      available", not "nothing to do". A dashboard that tells the user to log
 *      food before food logging exists is worse than one that stays quiet.
 *   2. A met target produces no entry. The list shows what is left, so an empty
 *      list is a complete day — which is exactly the signal worth giving.
 */

import type { StepsSummary } from '../activity/steps';
import type { IsoDate } from '@/types/domain';

export type PendingActionKind =
  | 'log_weight'
  | 'log_steps'
  | 'steps_remaining'
  | 'energy_remaining'
  | 'protein_remaining'
  | 'complete_workout';

export interface PendingAction {
  kind: PendingActionKind;
  label: string;
  detail?: string;
}

export interface DailyTargets {
  energyKcal: number;
  proteinG: number;
  stepGoal: number;
}

export interface PendingActionsInput {
  today: IsoDate;
  targets: DailyTargets;
  weightLoggedToday: boolean;
  steps: StepsSummary;
  /** `null` until food logging exists (phase 3). */
  nutrition: { consumedKcal: number; consumedProteinG: number } | null;
  /** `null` until the training planner exists (phase 6). */
  workout: { name: string; completed: boolean } | null;
}

/**
 * Ordered by what moves the needle most: the training session, then the two
 * nutrition targets that drive body composition, then activity, then the
 * measurements that feed the adaptive engine.
 */
const ORDER: Record<PendingActionKind, number> = {
  complete_workout: 0,
  protein_remaining: 1,
  energy_remaining: 2,
  steps_remaining: 3,
  log_steps: 4,
  log_weight: 5,
};

export function buildPendingActions(input: PendingActionsInput): PendingAction[] {
  const actions: PendingAction[] = [];

  if (input.workout && !input.workout.completed) {
    actions.push({
      kind: 'complete_workout',
      label: input.workout.name,
      detail: "Today's session",
    });
  }

  if (input.nutrition) {
    const proteinLeft = input.targets.proteinG - input.nutrition.consumedProteinG;
    if (proteinLeft > 0) {
      actions.push({
        kind: 'protein_remaining',
        label: `${formatNumber(proteinLeft)} g protein`,
        detail: 'Still to eat',
      });
    }

    const energyLeft = input.targets.energyKcal - input.nutrition.consumedKcal;
    if (energyLeft > 0) {
      actions.push({
        kind: 'energy_remaining',
        label: `${formatNumber(energyLeft)} kcal`,
        detail: 'Still to eat',
      });
    }
  }

  if (input.steps.todaySteps === null) {
    actions.push({ kind: 'log_steps', label: "Log today's steps" });
  } else if (!input.steps.goalMet) {
    actions.push({
      kind: 'steps_remaining',
      label: `${formatNumber(input.steps.remainingToday)} steps`,
      detail: `Goal ${formatNumber(input.steps.goal)}`,
    });
  }

  if (!input.weightLoggedToday) {
    actions.push({
      kind: 'log_weight',
      label: "Log today's weight",
      detail: 'Feeds your calorie target',
    });
  }

  return actions.sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
}

function formatNumber(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}
