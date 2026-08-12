import { describe, expect, it } from 'vitest';

import {
  buildCoachContext,
  coachSystemPrompt,
  serializeCoachContext,
  COACH_MAX_EXERCISES,
} from './context';
import type { BuildCoachContextInput, CoachExerciseContext } from './context';

const exercise = (name: string): CoachExerciseContext => ({
  name,
  lastWeightKg: 100,
  lastReps: 5,
  lastRir: 2,
  estimatedOneRmKg: 116.7,
  trendKgPerWeek: 1.2,
});

function input(over: Partial<BuildCoachContextInput> = {}): BuildCoachContextInput {
  return {
    today: '2025-06-22',
    profile: {
      ageYears: 32,
      sex: 'male',
      heightCm: 181,
      experience: 'intermediate',
      goal: 'lean_bulk',
      dietType: 'omnivore',
      allergens: [],
      safetyFlags: [],
    },
    nutrition: {
      targets: { energyKcal: 3000, proteinG: 170, carbsG: 350, fatG: 90, fiberG: 42 },
      meanIntakeKcal: 2980,
      meanProteinG: 168,
      daysLogged: 24,
      daysInWindow: 28,
      estimatedTdeeKcal: 2900,
      tdeeConfidence: 0.78,
    },
    body: {
      latestWeightKg: 82.4,
      trendWeightKg: 82.1,
      weightChangeKgPerWeek: 0.28,
      weighInCount: 22,
    },
    training: {
      sessionsCompleted: 14,
      plannedPerWeek: 4,
      weeklySetsByMuscle: { chest: 12, quads: 14 },
      recentExercises: [exercise('Barbell Bench Press')],
    },
    ...over,
  };
}

describe('buildCoachContext — sending only what is needed', () => {
  it('carries no name, email or identifier', () => {
    const json = serializeCoachContext(buildCoachContext(input()));

    expect(json).not.toMatch(/email|user_id|userId|display_name|displayName|birth/i);
  });

  it('sends an age rather than a date of birth', () => {
    const context = buildCoachContext(input());

    expect(context.profile.ageYears).toBe(32);
    expect(JSON.stringify(context)).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it('caps how many exercises it sends', () => {
    const many = Array.from({ length: 30 }, (_, index) => exercise(`Lift ${index}`));
    const context = buildCoachContext(
      input({ training: { ...input().training, recentExercises: many } }),
    );

    expect(context.training.recentExercises).toHaveLength(COACH_MAX_EXERCISES);
  });

  it('sends summaries, not logs', () => {
    // A whole month of entries would be thousands of rows; the shape only
    // allows aggregates in the first place.
    const context = buildCoachContext(input());

    expect(context.nutrition).toHaveProperty('meanIntakeKcal');
    expect(context.nutrition).not.toHaveProperty('entries');
  });
});

describe('buildCoachContext — naming what is unknown', () => {
  it('says nothing is unknown when the data is complete', () => {
    expect(buildCoachContext(input()).unknown).toEqual([]);
  });

  it('names an absent bodyweight history', () => {
    const context = buildCoachContext(
      input({
        body: { latestWeightKg: null, trendWeightKg: null, weightChangeKgPerWeek: null, weighInCount: 0 },
      }),
    );

    expect(context.unknown.join(' ')).toMatch(/bodyweight/i);
  });

  it('distinguishes "no weigh-ins" from "not enough for a trend"', () => {
    const sparse = buildCoachContext(
      input({
        body: { latestWeightKg: 82.4, trendWeightKg: null, weightChangeKgPerWeek: null, weighInCount: 2 },
      }),
    );

    expect(sparse.unknown.join(' ')).toMatch(/rate of weight change/i);
    expect(sparse.unknown.join(' ')).not.toMatch(/nothing has been weighed/i);
  });

  it('warns when the average intake rests on half a window', () => {
    const context = buildCoachContext(
      input({ nutrition: { ...input().nutrition, daysLogged: 6, daysInWindow: 28 } }),
    );

    expect(context.unknown.join(' ')).toContain('only 6 of 28 days');
  });

  it('says the expenditure figure is still an equation when there is no estimate', () => {
    const context = buildCoachContext(
      input({ nutrition: { ...input().nutrition, estimatedTdeeKcal: null, tdeeConfidence: null } }),
    );

    expect(context.unknown.join(' ')).toMatch(/measured expenditure/i);
  });

  it('names an empty training history', () => {
    const context = buildCoachContext(
      input({
        training: {
          sessionsCompleted: 0,
          plannedPerWeek: 4,
          weeklySetsByMuscle: {},
          recentExercises: [],
        },
      }),
    );

    expect(context.unknown.join(' ')).toMatch(/no sessions logged/i);
    expect(context.unknown.join(' ')).toMatch(/no logged sets/i);
  });

  it('lists every gap rather than the first one', () => {
    const context = buildCoachContext(
      input({
        body: { latestWeightKg: null, trendWeightKg: null, weightChangeKgPerWeek: null, weighInCount: 0 },
        nutrition: {
          targets: null,
          meanIntakeKcal: null,
          meanProteinG: null,
          daysLogged: 0,
          daysInWindow: 28,
          estimatedTdeeKcal: null,
          tdeeConfidence: null,
        },
        training: {
          sessionsCompleted: 0,
          plannedPerWeek: null,
          weeklySetsByMuscle: {},
          recentExercises: [],
        },
      }),
    );

    expect(context.unknown.length).toBeGreaterThanOrEqual(5);
  });
});

describe('coachSystemPrompt', () => {
  it('forbids inventing numbers', () => {
    const prompt = coachSystemPrompt(buildCoachContext(input()));
    expect(prompt).toMatch(/never estimate a number the context does not contain/i);
  });

  it('tells the coach it cannot change anything itself', () => {
    expect(coachSystemPrompt(buildCoachContext(input()))).toMatch(/cannot change anything yourself/i);
  });

  it('draws the medical line', () => {
    const prompt = coachSystemPrompt(buildCoachContext(input()));
    expect(prompt).toMatch(/not a medical professional/i);
    expect(prompt).toMatch(/qualified professional/i);
  });

  it('surfaces safety flags so they override normal advice', () => {
    const prompt = coachSystemPrompt(
      buildCoachContext(
        input({
          profile: { ...input().profile, safetyFlags: ['under 18 — no calorie deficit'] },
        }),
      ),
    );

    expect(prompt).toContain('under 18 — no calorie deficit');
  });

  it('leaves no empty lines when there are no safety flags', () => {
    const prompt = coachSystemPrompt(buildCoachContext(input()));
    expect(prompt.endsWith('\n')).toBe(false);
    expect(prompt).not.toMatch(/\n\n\n/);
  });
});

describe('serializeCoachContext', () => {
  it('is stable for identical state', () => {
    expect(serializeCoachContext(buildCoachContext(input()))).toBe(
      serializeCoachContext(buildCoachContext(input())),
    );
  });

  it('sorts keys at every level, not just the top', () => {
    const json = serializeCoachContext(buildCoachContext(input()));
    const nutrition = json.slice(json.indexOf('"nutrition"'));

    // `daysInWindow` sorts before `daysLogged` before `meanIntakeKcal`.
    expect(nutrition.indexOf('daysInWindow')).toBeLessThan(nutrition.indexOf('daysLogged'));
    expect(nutrition.indexOf('daysLogged')).toBeLessThan(nutrition.indexOf('meanIntakeKcal'));
  });

  it('keeps nested values rather than filtering them away', () => {
    const json = serializeCoachContext(buildCoachContext(input()));

    expect(json).toContain('Barbell Bench Press');
    expect(json).toContain('82.4');
    expect(json).toContain('chest');
  });

  it('preserves arrays as arrays', () => {
    const parsed = JSON.parse(serializeCoachContext(buildCoachContext(input())));
    expect(Array.isArray(parsed.training.recentExercises)).toBe(true);
    expect(Array.isArray(parsed.unknown)).toBe(true);
  });
});
