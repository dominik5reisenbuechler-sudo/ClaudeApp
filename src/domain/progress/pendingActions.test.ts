import { describe, expect, it } from 'vitest';

import { buildPendingActions } from './pendingActions';
import type { PendingActionsInput } from './pendingActions';
import { summarizeSteps } from '../activity/steps';

const TODAY = '2025-06-15';

const base: PendingActionsInput = {
  today: TODAY,
  targets: { energyKcal: 2650, proteinG: 175, stepGoal: 10000 },
  weightLoggedToday: true,
  steps: summarizeSteps([{ date: TODAY, steps: 10000 }], 10000, TODAY),
  nutrition: null,
  workout: null,
};

const kinds = (input: PendingActionsInput) => buildPendingActions(input).map((a) => a.kind);

describe('buildPendingActions', () => {
  it('returns nothing when the day is complete', () => {
    expect(buildPendingActions(base)).toEqual([]);
  });

  it('asks for a weigh-in when today has none', () => {
    const actions = buildPendingActions({ ...base, weightLoggedToday: false });
    expect(actions.map((a) => a.kind)).toEqual(['log_weight']);
    expect(actions[0]?.detail).toMatch(/calorie target/i);
  });

  it('asks for steps when none are logged', () => {
    const input = { ...base, steps: summarizeSteps([], 10000, TODAY) };
    expect(kinds(input)).toContain('log_steps');
    expect(kinds(input)).not.toContain('steps_remaining');
  });

  it('reports the shortfall once steps are logged but short of the goal', () => {
    const input = {
      ...base,
      steps: summarizeSteps([{ date: TODAY, steps: 8431 }], 10000, TODAY),
    };
    const actions = buildPendingActions(input);
    const stepAction = actions.find((a) => a.kind === 'steps_remaining');
    expect(stepAction?.label).toBe('1,569 steps');
    expect(actions.map((a) => a.kind)).not.toContain('log_steps');
  });

  it('drops the step action once the goal is met', () => {
    const input = {
      ...base,
      steps: summarizeSteps([{ date: TODAY, steps: 11000 }], 10000, TODAY),
    };
    expect(kinds(input)).not.toContain('steps_remaining');
  });

  it('stays silent about food while food logging does not exist', () => {
    // `nutrition: null` means the capability is unavailable, not that the user
    // has eaten nothing. Telling them to log food they cannot log would be a bug.
    const result = kinds({ ...base, nutrition: null });
    expect(result).not.toContain('energy_remaining');
    expect(result).not.toContain('protein_remaining');
  });

  it('reports remaining calories and protein once nutrition data exists', () => {
    const actions = buildPendingActions({
      ...base,
      nutrition: { consumedKcal: 1820, consumedProteinG: 142 },
    });
    expect(actions.find((a) => a.kind === 'energy_remaining')?.label).toBe('830 kcal');
    expect(actions.find((a) => a.kind === 'protein_remaining')?.label).toBe('33 g protein');
  });

  it('drops nutrition actions once the targets are met or exceeded', () => {
    const result = kinds({
      ...base,
      nutrition: { consumedKcal: 2700, consumedProteinG: 180 },
    });
    expect(result).not.toContain('energy_remaining');
    expect(result).not.toContain('protein_remaining');
  });

  it('stays silent about training while the planner does not exist', () => {
    expect(kinds({ ...base, workout: null })).not.toContain('complete_workout');
  });

  it('surfaces an incomplete workout and drops a completed one', () => {
    expect(
      kinds({ ...base, workout: { name: 'Upper Body A', completed: false } }),
    ).toContain('complete_workout');
    expect(
      kinds({ ...base, workout: { name: 'Upper Body A', completed: true } }),
    ).not.toContain('complete_workout');
  });

  it('orders by impact: training, then nutrition, then activity, then measurement', () => {
    const actions = kinds({
      ...base,
      weightLoggedToday: false,
      steps: summarizeSteps([{ date: TODAY, steps: 8431 }], 10000, TODAY),
      nutrition: { consumedKcal: 1820, consumedProteinG: 142 },
      workout: { name: 'Upper Body A', completed: false },
    });
    expect(actions).toEqual([
      'complete_workout',
      'protein_remaining',
      'energy_remaining',
      'steps_remaining',
      'log_weight',
    ]);
  });
});
