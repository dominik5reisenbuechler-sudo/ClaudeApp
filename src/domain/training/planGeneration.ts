/**
 * Training plan generation.
 *
 * Splits are chosen to satisfy the ≥2×/week frequency target within the days
 * and session length available — not by popularity (SCIENTIFIC_RULES.md §4.8).
 * Volume starts inside each muscle's band and is shifted by the user's stated
 * priorities, within what is recoverable.
 *
 * Deterministic: the same preferences always produce the same programme, so it
 * can be regenerated, explained and tested (ADR-004).
 */

import type { MuscleContribution } from './volume';
import { MUSCLE_IDS } from '@/types/domain';
import type { ExperienceLevel, MuscleId, MusclePriority, PlanStructure } from '@/types/domain';
import { clamp } from '@/utils/number';

export interface PlannableExercise {
  id: string;
  name: string;
  equipment: string;
  movementPattern: string;
  repRangeMin: number;
  repRangeMax: number;
  defaultRestSeconds: number;
  /** 1 (low) to 5 (high); null when unrated. */
  fatigueRating: number | null;
  stabilityRating: number | null;
  contributions: readonly MuscleContribution[];
}

export interface MuscleBand {
  minSets: number;
  maxSets: number;
}

export interface TrainingPlanInput {
  daysPerWeek: number;
  sessionMinutes: number;
  experience: ExperienceLevel;
  availableEquipment: readonly string[];
  musclePriorities: Partial<Record<MuscleId, MusclePriority>>;
  exercises: readonly PlannableExercise[];
  muscleBands: Partial<Record<MuscleId, MuscleBand>>;
}

export interface PlannedExercise {
  exerciseId: string;
  name: string;
  sets: number;
  repMin: number;
  repMax: number;
  targetRir: number;
  restSeconds: number;
}

export interface GeneratedWorkoutDay {
  dayIndex: number;
  name: string;
  targetMuscles: MuscleId[];
  exercises: PlannedExercise[];
  estimatedMinutes: number;
}

export interface GeneratedTrainingPlan {
  name: string;
  structure: PlanStructure;
  daysPerWeek: number;
  days: GeneratedWorkoutDay[];
  /** What the programme actually delivers, in fractional sets. */
  weeklySetsByMuscle: Record<MuscleId, number>;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Split selection
// ---------------------------------------------------------------------------

const UPPER: MuscleId[] = [
  'chest', 'lats', 'upper_back', 'front_delts', 'side_delts', 'rear_delts',
  'biceps', 'triceps', 'traps',
];
const LOWER: MuscleId[] = ['quads', 'hamstrings', 'glutes', 'calves', 'adductors', 'abs'];
const PUSH: MuscleId[] = ['chest', 'front_delts', 'side_delts', 'triceps'];
const PULL: MuscleId[] = ['lats', 'upper_back', 'rear_delts', 'biceps', 'traps'];
const LEGS: MuscleId[] = ['quads', 'hamstrings', 'glutes', 'calves', 'abs'];
const FULL: MuscleId[] = [...UPPER, ...LOWER];

interface SplitTemplate {
  structure: PlanStructure;
  name: string;
  days: { name: string; muscles: MuscleId[] }[];
}

/**
 * Chosen so every muscle is trained at least twice a week wherever the day
 * count allows it — the frequency finding in SCIENTIFIC_RULES.md §4.1.
 */
export function selectSplit(daysPerWeek: number): SplitTemplate {
  const days = clamp(Math.round(daysPerWeek), 2, 6);

  switch (days) {
    case 2:
      return {
        structure: 'full_body',
        name: 'Full Body ×2',
        days: [
          { name: 'Full Body A', muscles: FULL },
          { name: 'Full Body B', muscles: FULL },
        ],
      };
    case 3:
      return {
        structure: 'full_body',
        name: 'Full Body ×3',
        days: [
          { name: 'Full Body A', muscles: FULL },
          { name: 'Full Body B', muscles: FULL },
          { name: 'Full Body C', muscles: FULL },
        ],
      };
    case 4:
      return {
        structure: 'upper_lower',
        name: 'Upper / Lower',
        days: [
          { name: 'Upper A', muscles: UPPER },
          { name: 'Lower A', muscles: LOWER },
          { name: 'Upper B', muscles: UPPER },
          { name: 'Lower B', muscles: LOWER },
        ],
      };
    case 5:
      return {
        structure: 'hybrid',
        name: 'Upper / Lower / Push / Pull / Legs',
        days: [
          { name: 'Upper', muscles: UPPER },
          { name: 'Lower', muscles: LOWER },
          { name: 'Push', muscles: PUSH },
          { name: 'Pull', muscles: PULL },
          { name: 'Legs', muscles: LEGS },
        ],
      };
    default:
      return {
        structure: 'push_pull_legs',
        name: 'Push / Pull / Legs ×2',
        days: [
          { name: 'Push A', muscles: PUSH },
          { name: 'Pull A', muscles: PULL },
          { name: 'Legs A', muscles: LEGS },
          { name: 'Push B', muscles: PUSH },
          { name: 'Pull B', muscles: PULL },
          { name: 'Legs B', muscles: LEGS },
        ],
      };
  }
}

// ---------------------------------------------------------------------------
// Volume allocation
// ---------------------------------------------------------------------------

/** Where in each muscle's band to start, by training age. */
const EXPERIENCE_POSITION: Record<ExperienceLevel, number> = {
  beginner: 0.15,
  intermediate: 0.5,
  advanced: 0.7,
};

/** Extra weekly sets per priority star. */
const SETS_PER_PRIORITY = 2;

/** Hard ceiling from SCIENTIFIC_RULES.md §4.1 — more is rarely recoverable. */
export const WEEKLY_SET_CEILING = 20;

/**
 * Target weekly sets per muscle.
 *
 * Priorities add sets rather than redistributing them, but the ceiling stops
 * "everything is a priority" from producing a programme nobody can recover
 * from. That cap is the honest part: recovery is finite.
 */
export function allocateWeeklySets(
  bands: Partial<Record<MuscleId, MuscleBand>>,
  priorities: Partial<Record<MuscleId, MusclePriority>>,
  experience: ExperienceLevel,
): Record<MuscleId, number> {
  const position = EXPERIENCE_POSITION[experience];

  return Object.fromEntries(
    MUSCLE_IDS.map((muscleId) => {
      const band = bands[muscleId] ?? { minSets: 8, maxSets: 12 };
      const base = band.minSets + (band.maxSets - band.minSets) * position;
      const bonus = (priorities[muscleId] ?? 0) * SETS_PER_PRIORITY;
      const allocated = Math.round(base + bonus);
      return [muscleId, clamp(allocated, 0, Math.min(band.maxSets + 6, WEEKLY_SET_CEILING))];
    }),
  ) as Record<MuscleId, number>;
}

// ---------------------------------------------------------------------------
// Exercise selection
// ---------------------------------------------------------------------------

/** Minutes one set costs, including its rest. */
function setMinutes(restSeconds: number): number {
  const workSeconds = 40;
  return (restSeconds + workSeconds) / 60;
}

function isAvailable(exercise: PlannableExercise, equipment: readonly string[]): boolean {
  if (equipment.length === 0) return true;
  if (exercise.equipment === 'bodyweight') return true;
  return equipment.includes(exercise.equipment);
}

/**
 * How much an exercise contributes to what this day still needs.
 *
 * Compounds score highly because they cover several needs at once, which is
 * what makes a session fit in the time available. Stability breaks ties: a
 * movement where the target muscle can actually be the limiting factor is more
 * useful than one limited by balance.
 */
function coverageScore(
  exercise: PlannableExercise,
  remaining: Record<MuscleId, number>,
  targetMuscles: ReadonlySet<MuscleId>,
): number {
  let score = 0;
  for (const contribution of exercise.contributions) {
    if (!targetMuscles.has(contribution.muscleId)) continue;
    const need = remaining[contribution.muscleId];
    if (need <= 0) continue;
    score += Math.min(need, 3) * contribution.setCredit;
  }

  if (score === 0) return 0;

  const stability = (exercise.stabilityRating ?? 3) / 5;
  const fatigue = (exercise.fatigueRating ?? 3) / 5;
  // Prefer good stimulus per unit of fatigue, all else equal.
  return score * (1 + 0.15 * stability - 0.1 * fatigue);
}

/** Working sets per exercise. Compounds carry more of the load. */
function setsForExercise(exercise: PlannableExercise, remainingNeed: number): number {
  const isCompound = exercise.contributions.filter((c) => c.setCredit >= 1).length > 1;
  const preferred = isCompound ? 4 : 3;
  return clamp(Math.round(Math.min(preferred, remainingNeed)), 2, 4);
}

/**
 * Target reps in reserve. Isolation work on stable machines can safely be taken
 * closer to failure than a heavy compound (SCIENTIFIC_RULES.md §4.2).
 */
function targetRirFor(exercise: PlannableExercise): number {
  return exercise.movementPattern === 'isolation' || exercise.movementPattern === 'core' ? 1 : 2;
}

export function generateTrainingPlan(input: TrainingPlanInput): GeneratedTrainingPlan {
  const split = selectSplit(input.daysPerWeek);
  const allocation = allocateWeeklySets(input.muscleBands, input.musclePriorities, input.experience);
  const warnings: string[] = [];

  const available = input.exercises
    .filter((exercise) => isAvailable(exercise, input.availableEquipment))
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id));

  if (available.length === 0) {
    return {
      name: split.name,
      structure: split.structure,
      daysPerWeek: split.days.length,
      days: [],
      weeklySetsByMuscle: Object.fromEntries(MUSCLE_IDS.map((id) => [id, 0])) as Record<MuscleId, number>,
      warnings: [
        'No exercises match the equipment you have available, so we could not build a programme.',
      ],
    };
  }

  // Remaining weekly need, drawn down as the week is filled.
  const remaining: Record<MuscleId, number> = { ...allocation };
  const delivered = Object.fromEntries(MUSCLE_IDS.map((id) => [id, 0])) as Record<MuscleId, number>;

  const days: GeneratedWorkoutDay[] = split.days.map((template, dayIndex) => {
    const targetMuscles = new Set(template.muscles);
    const daysRemaining = split.days.length - dayIndex;

    // Spread what is left evenly across the sessions that can still train it.
    const dayBudget: Record<MuscleId, number> = { ...remaining };
    for (const muscleId of MUSCLE_IDS) {
      const sessionsLeft = split.days
        .slice(dayIndex)
        .filter((day) => day.muscles.includes(muscleId)).length;
      dayBudget[muscleId] = sessionsLeft > 0 ? remaining[muscleId] / sessionsLeft : 0;
      void daysRemaining;
    }

    const exercises: PlannedExercise[] = [];
    const used = new Set<string>();
    let minutes = 0;

    while (minutes < input.sessionMinutes && exercises.length < 8) {
      let best: PlannableExercise | null = null;
      let bestScore = 0;

      for (const exercise of available) {
        if (used.has(exercise.id)) continue;
        const score = coverageScore(exercise, dayBudget, targetMuscles);
        // Strictly greater, over a stably sorted list — deterministic.
        if (score > bestScore) {
          bestScore = score;
          best = exercise;
        }
      }

      if (!best) break;

      const need = Math.max(
        ...best.contributions
          .filter((c) => targetMuscles.has(c.muscleId))
          .map((c) => dayBudget[c.muscleId]),
        0,
      );
      const sets = setsForExercise(best, Math.max(need, 2));
      const cost = sets * setMinutes(best.defaultRestSeconds);

      // Take the first exercise regardless of budget: a session with one lift
      // beats an empty day.
      if (minutes + cost > input.sessionMinutes && exercises.length > 0) break;

      exercises.push({
        exerciseId: best.id,
        name: best.name,
        sets,
        repMin: best.repRangeMin,
        repMax: best.repRangeMax,
        targetRir: targetRirFor(best),
        restSeconds: best.defaultRestSeconds,
      });
      used.add(best.id);
      minutes += cost;

      for (const contribution of best.contributions) {
        const credited = sets * contribution.setCredit;
        dayBudget[contribution.muscleId] = Math.max(0, dayBudget[contribution.muscleId] - credited);
        remaining[contribution.muscleId] = Math.max(0, remaining[contribution.muscleId] - credited);
        delivered[contribution.muscleId] = round2(delivered[contribution.muscleId] + credited);
      }
    }

    return {
      dayIndex,
      name: template.name,
      targetMuscles: template.muscles,
      exercises,
      estimatedMinutes: Math.round(minutes),
    };
  });

  // Report shortfalls rather than presenting a programme that quietly misses.
  const shortfalls = MUSCLE_IDS.filter(
    (muscleId) => allocation[muscleId] > 0 && delivered[muscleId] < allocation[muscleId] * 0.6,
  );
  if (shortfalls.length > 0) {
    warnings.push(
      `${shortfalls.length} ${shortfalls.length === 1 ? 'muscle gets' : 'muscles get'} less volume than we would like, given your session length and equipment. Longer sessions or an extra training day would close the gap.`,
    );
  }

  const overLength = days.filter((day) => day.estimatedMinutes > input.sessionMinutes);
  if (overLength.length > 0) {
    warnings.push(
      `${overLength.length} ${overLength.length === 1 ? 'session runs' : 'sessions run'} slightly over your ${input.sessionMinutes} minute target. Drop the last exercise if you are short on time.`,
    );
  }

  return {
    name: split.name,
    structure: split.structure,
    daysPerWeek: split.days.length,
    days,
    weeklySetsByMuscle: delivered,
    warnings,
  };
}

const round2 = (value: number): number => Math.round(value * 100) / 100;
