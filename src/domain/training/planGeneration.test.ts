import { describe, expect, it } from 'vitest';

import {
  allocateWeeklySets,
  generateTrainingPlan,
  selectSplit,
  WEEKLY_SET_CEILING,
} from './planGeneration';
import type { PlannableExercise, TrainingPlanInput } from './planGeneration';
import type { MuscleId } from '@/types/domain';

const exercise = (
  id: string,
  contributions: [MuscleId, number][],
  over: Partial<PlannableExercise> = {},
): PlannableExercise => ({
  id,
  name: id.replace(/_/g, ' '),
  equipment: 'barbell',
  movementPattern: 'horizontal_push',
  repRangeMin: 8,
  repRangeMax: 12,
  defaultRestSeconds: 120,
  fatigueRating: 3,
  stabilityRating: 3,
  contributions: contributions.map(([muscleId, setCredit]) => ({ muscleId, setCredit })),
  ...over,
});

/** A catalogue covering every muscle a split can target. */
const catalogue: PlannableExercise[] = [
  exercise('barbell_bench_press', [['chest', 1], ['triceps', 0.5], ['front_delts', 0.5]]),
  exercise('incline_dumbbell_press', [['chest', 1], ['front_delts', 0.5]], { equipment: 'dumbbell' }),
  exercise('overhead_press', [['front_delts', 1], ['side_delts', 0.5], ['triceps', 0.5]], { movementPattern: 'vertical_push' }),
  exercise('barbell_row', [['lats', 1], ['upper_back', 1], ['biceps', 0.5]], { movementPattern: 'horizontal_pull' }),
  exercise('lat_pulldown', [['lats', 1], ['biceps', 0.5]], { equipment: 'machine', movementPattern: 'vertical_pull' }),
  exercise('back_squat', [['quads', 1], ['glutes', 1], ['adductors', 0.5]], { movementPattern: 'squat' }),
  exercise('romanian_deadlift', [['hamstrings', 1], ['glutes', 1]], { movementPattern: 'hinge' }),
  exercise('seated_leg_curl', [['hamstrings', 1]], { equipment: 'machine', movementPattern: 'isolation' }),
  exercise('lateral_raise', [['side_delts', 1]], { equipment: 'dumbbell', movementPattern: 'isolation', defaultRestSeconds: 90 }),
  exercise('reverse_fly', [['rear_delts', 1]], { equipment: 'dumbbell', movementPattern: 'isolation', defaultRestSeconds: 90 }),
  exercise('dumbbell_curl', [['biceps', 1]], { equipment: 'dumbbell', movementPattern: 'isolation', defaultRestSeconds: 90 }),
  exercise('cable_pushdown', [['triceps', 1]], { equipment: 'cable', movementPattern: 'isolation', defaultRestSeconds: 90 }),
  exercise('standing_calf_raise', [['calves', 1]], { equipment: 'machine', movementPattern: 'isolation', defaultRestSeconds: 90 }),
  exercise('cable_crunch', [['abs', 1]], { equipment: 'cable', movementPattern: 'core', defaultRestSeconds: 90 }),
  exercise('shrug', [['traps', 1]], { equipment: 'dumbbell', movementPattern: 'isolation', defaultRestSeconds: 90 }),
  exercise('push_up', [['chest', 1], ['triceps', 0.5]], { equipment: 'bodyweight' }),
];

const input = (over: Partial<TrainingPlanInput> = {}): TrainingPlanInput => ({
  daysPerWeek: 4,
  sessionMinutes: 60,
  experience: 'intermediate',
  availableEquipment: ['barbell', 'dumbbell', 'machine', 'cable', 'bench'],
  musclePriorities: {},
  exercises: catalogue,
  muscleBands: {},
  ...over,
});

describe('selectSplit', () => {
  it('uses full body for two and three days, so everything is hit twice', () => {
    expect(selectSplit(2).structure).toBe('full_body');
    expect(selectSplit(2).days).toHaveLength(2);
    expect(selectSplit(3).structure).toBe('full_body');
  });

  it('uses upper/lower at four days', () => {
    const split = selectSplit(4);
    expect(split.structure).toBe('upper_lower');
    expect(split.days.map((day) => day.name)).toEqual(['Upper A', 'Lower A', 'Upper B', 'Lower B']);
  });

  it('uses a hybrid at five and push/pull/legs at six', () => {
    expect(selectSplit(5).structure).toBe('hybrid');
    expect(selectSplit(6).structure).toBe('push_pull_legs');
    expect(selectSplit(6).days).toHaveLength(6);
  });

  it('clamps unreasonable day counts rather than failing', () => {
    expect(selectSplit(1).days).toHaveLength(2);
    expect(selectSplit(9).days).toHaveLength(6);
  });

  it('trains every major muscle at least twice a week', () => {
    for (const days of [2, 3, 4, 5, 6]) {
      const split = selectSplit(days);
      for (const muscle of ['chest', 'lats', 'quads', 'hamstrings'] as MuscleId[]) {
        const sessions = split.days.filter((day) => day.muscles.includes(muscle)).length;
        expect(sessions, `${muscle} on ${days} days`).toBeGreaterThanOrEqual(2);
      }
    }
  });
});

describe('allocateWeeklySets', () => {
  it('starts beginners low in the band and advanced trainees higher', () => {
    const bands = { chest: { minSets: 10, maxSets: 16 } };
    const beginner = allocateWeeklySets(bands, {}, 'beginner').chest;
    const advanced = allocateWeeklySets(bands, {}, 'advanced').chest;

    expect(beginner).toBeLessThan(advanced);
    expect(beginner).toBeGreaterThanOrEqual(10);
  });

  it('adds sets for a prioritised muscle', () => {
    const bands = { side_delts: { minSets: 10, maxSets: 18 } };
    const normal = allocateWeeklySets(bands, {}, 'intermediate').side_delts;
    const priority = allocateWeeklySets(bands, { side_delts: 3 }, 'intermediate').side_delts;

    expect(priority).toBe(normal + 6);
  });

  it('caps volume at what is recoverable, however many stars are set', () => {
    const bands = { chest: { minSets: 16, maxSets: 20 } };
    const allocated = allocateWeeklySets(bands, { chest: 3 }, 'advanced').chest;
    expect(allocated).toBeLessThanOrEqual(WEEKLY_SET_CEILING);
  });

  it('covers all eighteen muscles', () => {
    expect(Object.keys(allocateWeeklySets({}, {}, 'intermediate'))).toHaveLength(18);
  });
});

describe('generateTrainingPlan', () => {
  it('produces one day per training day, each with exercises', () => {
    const plan = generateTrainingPlan(input());

    expect(plan.days).toHaveLength(4);
    for (const day of plan.days) expect(day.exercises.length).toBeGreaterThan(0);
  });

  it('is deterministic', () => {
    expect(generateTrainingPlan(input())).toEqual(generateTrainingPlan(input()));
  });

  it('only programmes exercises the user can actually perform', () => {
    const plan = generateTrainingPlan(
      input({ availableEquipment: ['dumbbell'], sessionMinutes: 60 }),
    );
    const byId = new Map(catalogue.map((ex) => [ex.id, ex]));

    for (const day of plan.days) {
      for (const planned of day.exercises) {
        const source = byId.get(planned.exerciseId);
        expect(['dumbbell', 'bodyweight']).toContain(source?.equipment);
      }
    }
  });

  it('keeps sessions roughly inside the time available', () => {
    const plan = generateTrainingPlan(input({ sessionMinutes: 45 }));
    for (const day of plan.days) {
      // One exercise may overshoot: a session with one lift beats an empty day.
      expect(day.estimatedMinutes).toBeLessThan(45 + 20);
    }
  });

  it('fits more work into a longer session', () => {
    const short = generateTrainingPlan(input({ sessionMinutes: 30 }));
    const long = generateTrainingPlan(input({ sessionMinutes: 90 }));

    const count = (plan: typeof short) =>
      plan.days.reduce((total, day) => total + day.exercises.length, 0);

    expect(count(long)).toBeGreaterThan(count(short));
  });

  it('gives a prioritised muscle more weekly sets', () => {
    const normal = generateTrainingPlan(input({ daysPerWeek: 6, sessionMinutes: 75 }));
    const prioritised = generateTrainingPlan(
      input({ daysPerWeek: 6, sessionMinutes: 75, musclePriorities: { side_delts: 3 } }),
    );

    expect(prioritised.weeklySetsByMuscle.side_delts).toBeGreaterThanOrEqual(
      normal.weeklySetsByMuscle.side_delts,
    );
  });

  it('reports what it delivered in fractional sets', () => {
    const plan = generateTrainingPlan(input());
    expect(Object.keys(plan.weeklySetsByMuscle)).toHaveLength(18);
    expect(plan.weeklySetsByMuscle.chest).toBeGreaterThan(0);
  });

  it('prescribes a rep range and RIR for every exercise', () => {
    const plan = generateTrainingPlan(input());
    for (const day of plan.days) {
      for (const planned of day.exercises) {
        expect(planned.repMax).toBeGreaterThanOrEqual(planned.repMin);
        expect(planned.targetRir).toBeGreaterThanOrEqual(0);
        expect(planned.targetRir).toBeLessThanOrEqual(3);
        expect(planned.sets).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('takes isolation work closer to failure than compounds', () => {
    const plan = generateTrainingPlan(input({ sessionMinutes: 90 }));
    const all = plan.days.flatMap((day) => day.exercises);
    const byId = new Map(catalogue.map((ex) => [ex.id, ex]));

    for (const planned of all) {
      const source = byId.get(planned.exerciseId);
      if (source?.movementPattern === 'isolation') expect(planned.targetRir).toBe(1);
    }
  });

  it('does not repeat an exercise within a session', () => {
    const plan = generateTrainingPlan(input({ sessionMinutes: 120 }));
    for (const day of plan.days) {
      const ids = day.exercises.map((planned) => planned.exerciseId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('says so when it cannot build a programme at all', () => {
    const plan = generateTrainingPlan(input({ exercises: [] }));
    expect(plan.days).toEqual([]);
    expect(plan.warnings[0]).toMatch(/could not build/i);
  });

  it('warns rather than quietly under-delivering on a short session', () => {
    const plan = generateTrainingPlan(input({ daysPerWeek: 2, sessionMinutes: 25 }));
    expect(plan.warnings.length).toBeGreaterThan(0);
  });

  it('still produces a usable session with only bodyweight available', () => {
    const plan = generateTrainingPlan(input({ availableEquipment: ['bodyweight'] }));
    expect(plan.days.some((day) => day.exercises.length > 0)).toBe(true);
  });
});
