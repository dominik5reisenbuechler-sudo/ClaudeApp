import { getSupabase } from '@/lib/supabase';
import type { GeneratedTrainingPlan, PlannableExercise } from '@/domain/training/planGeneration';
import type { ContributionMap, MuscleContribution, PerformedSet } from '@/domain/training/volume';
import type { LoggedSet } from '@/domain/training/progression';
import type { StrengthSet } from '@/domain/progress/strengthProgress';
import type {
  ExerciseMuscleRow,
  ExerciseRow,
  ExerciseSetRow,
  Json,
  MuscleRow,
  WorkoutDayRow,
  WorkoutExerciseRow,
  WorkoutPlanRow,
  WorkoutSessionRow,
} from '@/types/database';
import type { IsoDate, MuscleId } from '@/types/domain';
import { toIsoDate } from '@/utils/date';

/**
 * Repository for training reference data, plans, sessions and sets.
 *
 * The reference tables (`muscles`, `exercises`, `exercise_muscles`) are seeded
 * content that changes rarely, so callers cache them for a long time. Sets are
 * the atom everything else derives from and are never aggregated in the
 * database — volume, progression and records are all computed by the domain
 * layer from raw rows.
 */

export async function fetchMuscles(): Promise<MuscleRow[]> {
  const { data, error } = await getSupabase()
    .from('muscles')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchExercises(): Promise<ExerciseRow[]> {
  const { data, error } = await getSupabase()
    .from('exercises')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchExerciseMuscles(): Promise<ExerciseMuscleRow[]> {
  const { data, error } = await getSupabase().from('exercise_muscles').select('*');
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** exerciseId → fractional credits, in the shape the volume domain consumes. */
export function toContributionMap(rows: readonly ExerciseMuscleRow[]): ContributionMap {
  const map = new Map<string, MuscleContribution[]>();
  for (const row of rows) {
    const credits = map.get(row.exercise_id) ?? [];
    credits.push({ muscleId: row.muscle_id, setCredit: Number(row.set_credit) });
    map.set(row.exercise_id, credits);
  }
  return map;
}

export function toPlannableExercises(
  exercises: readonly ExerciseRow[],
  contributions: ContributionMap,
): PlannableExercise[] {
  return exercises.map((row) => ({
    id: row.id,
    name: row.name,
    equipment: row.equipment,
    movementPattern: row.movement_pattern,
    repRangeMin: row.rep_range_min,
    repRangeMax: row.rep_range_max,
    defaultRestSeconds: row.default_rest_seconds,
    fatigueRating: row.fatigue_rating,
    stabilityRating: row.stability_rating,
    contributions: contributions.get(row.id) ?? [],
  }));
}

export async function fetchAlternatives(exerciseId: string): Promise<ExerciseRow[]> {
  const { data, error } = await getSupabase()
    .from('exercise_alternatives')
    .select('similarity, exercises!exercise_alternatives_alternative_id_fkey(*)')
    .eq('exercise_id', exerciseId)
    .order('similarity', { ascending: false });
  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as { exercises: ExerciseRow | null }[])
    .map((row) => row.exercises)
    .filter((row): row is ExerciseRow => row !== null);
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

export interface WorkoutDayWithExercises extends WorkoutDayRow {
  exercises: (WorkoutExerciseRow & { exercise: ExerciseRow | null })[];
}

export interface FullWorkoutPlan extends WorkoutPlanRow {
  days: WorkoutDayWithExercises[];
}

export async function fetchActivePlan(userId: string): Promise<FullWorkoutPlan | null> {
  const { data, error } = await getSupabase()
    .from('workout_plans')
    .select('*, workout_days(*, workout_exercises(*, exercises(*)))')
    .eq('user_id', userId)
    .is('ended_on', null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const raw = data as unknown as WorkoutPlanRow & {
    workout_days: (WorkoutDayRow & {
      workout_exercises: (WorkoutExerciseRow & { exercises: ExerciseRow | null })[];
    })[];
  };

  return {
    ...raw,
    days: raw.workout_days
      .slice()
      .sort((a, b) => a.day_index - b.day_index)
      .map(({ workout_exercises, ...day }) => ({
        ...day,
        exercises: workout_exercises
          .slice()
          .sort((a, b) => a.sort_order - b.sort_order)
          .map(({ exercises, ...entry }) => ({ ...entry, exercise: exercises })),
      })),
  };
}

/**
 * Persist a generated programme, closing any previous one.
 *
 * The old plan is ended rather than deleted: sessions logged against it still
 * reference its days, and a training history that loses its programme context
 * is much harder to interpret later.
 */
export async function saveGeneratedPlan(
  userId: string,
  generated: GeneratedTrainingPlan,
  params: Record<string, unknown>,
  today: IsoDate = toIsoDate(new Date()),
): Promise<FullWorkoutPlan> {
  const supabase = getSupabase();

  const { error: closeError } = await supabase
    .from('workout_plans')
    .update({ ended_on: today })
    .eq('user_id', userId)
    .is('ended_on', null);
  if (closeError) throw new Error(closeError.message);

  const { data: plan, error } = await supabase
    .from('workout_plans')
    .insert({
      user_id: userId,
      name: generated.name,
      days_per_week: generated.daysPerWeek,
      structure: generated.structure,
      generated_by: 'generator',
      generation_params: params as Json,
      started_on: today,
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  if (!plan) throw new Error('Creating the plan returned no row');

  for (const day of generated.days) {
    const { data: dayRow, error: dayError } = await supabase
      .from('workout_days')
      .insert({
        workout_plan_id: plan.id,
        day_index: day.dayIndex,
        name: day.name,
        target_muscles: day.targetMuscles,
      })
      .select('*')
      .single();
    if (dayError) throw new Error(dayError.message);
    if (!dayRow) continue;

    if (day.exercises.length === 0) continue;

    const { error: exercisesError } = await supabase.from('workout_exercises').insert(
      day.exercises.map((exercise, index) => ({
        workout_day_id: dayRow.id,
        exercise_id: exercise.exerciseId,
        sort_order: index,
        target_sets: exercise.sets,
        target_rep_min: exercise.repMin,
        target_rep_max: exercise.repMax,
        target_rir: exercise.targetRir,
        rest_seconds: exercise.restSeconds,
      })),
    );
    if (exercisesError) throw new Error(exercisesError.message);
  }

  const saved = await fetchActivePlan(userId);
  if (!saved) throw new Error('Plan was created but could not be read back');
  return saved;
}

export async function swapPlanExercise(
  workoutExerciseId: string,
  newExerciseId: string,
): Promise<void> {
  const { error } = await getSupabase()
    .from('workout_exercises')
    .update({ exercise_id: newExerciseId })
    .eq('id', workoutExerciseId);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Sessions and sets
// ---------------------------------------------------------------------------

export interface FullSession extends WorkoutSessionRow {
  sets: ExerciseSetRow[];
}

export async function startSession(
  userId: string,
  workoutDayId: string | null,
  name: string | null,
): Promise<WorkoutSessionRow> {
  const { data, error } = await getSupabase()
    .from('workout_sessions')
    .insert({ user_id: userId, workout_day_id: workoutDayId, name })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Starting the session returned no row');
  return data;
}

export async function fetchSession(sessionId: string): Promise<FullSession | null> {
  const { data, error } = await getSupabase()
    .from('workout_sessions')
    .select('*, exercise_sets(*)')
    .eq('id', sessionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const raw = data as unknown as WorkoutSessionRow & { exercise_sets: ExerciseSetRow[] };
  return {
    ...raw,
    sets: raw.exercise_sets.slice().sort((a, b) => a.set_index - b.set_index),
  };
}

/** The most recent session that is still open, if any. */
export async function fetchActiveSession(userId: string): Promise<FullSession | null> {
  const { data, error } = await getSupabase()
    .from('workout_sessions')
    .select('id')
    .eq('user_id', userId)
    .is('completed_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return fetchSession(data.id);
}

export interface LogSetInput {
  sessionId: string;
  exerciseId: string;
  setIndex: number;
  weightKg: number | null;
  reps: number | null;
  rir: number | null;
  setType?: ExerciseSetRow['set_type'];
  techniqueBreakdown?: boolean;
  painReported?: boolean;
}

export async function logSet(input: LogSetInput): Promise<ExerciseSetRow> {
  const { data, error } = await getSupabase()
    .from('exercise_sets')
    .insert({
      workout_session_id: input.sessionId,
      exercise_id: input.exerciseId,
      set_index: input.setIndex,
      weight_kg: input.weightKg,
      reps: input.reps,
      rir: input.rir,
      set_type: input.setType ?? 'working',
      technique_breakdown: input.techniqueBreakdown ?? false,
      pain_reported: input.painReported ?? false,
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Logging the set returned no row');
  return data;
}

export async function deleteSet(setId: string): Promise<void> {
  const { error } = await getSupabase().from('exercise_sets').delete().eq('id', setId);
  if (error) throw new Error(error.message);
}

export async function completeSession(
  sessionId: string,
  sessionRpe: number | null,
  notes: string | null,
): Promise<void> {
  const { error } = await getSupabase()
    .from('workout_sessions')
    .update({ completed_at: new Date().toISOString(), session_rpe: sessionRpe, notes })
    .eq('id', sessionId);
  if (error) throw new Error(error.message);
}

export async function fetchSessionHistory(
  userId: string,
  limit = 30,
): Promise<FullSession[]> {
  const { data, error } = await getSupabase()
    .from('workout_sessions')
    .select('*, exercise_sets(*)')
    .eq('user_id', userId)
    .not('completed_at', 'is', null)
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as (WorkoutSessionRow & { exercise_sets: ExerciseSetRow[] })[]).map(
    ({ exercise_sets, ...session }) => ({
      ...session,
      sets: exercise_sets.slice().sort((a, b) => a.set_index - b.set_index),
    }),
  );
}

/** Sets for one exercise, newest session first — the "previous performance" panel. */
export async function fetchRecentSetsForExercise(
  userId: string,
  exerciseId: string,
  sessionLimit = 4,
): Promise<{ sessionId: string; performedAt: string; sets: ExerciseSetRow[] }[]> {
  const { data, error } = await getSupabase()
    .from('exercise_sets')
    .select('*, workout_sessions!inner(user_id, started_at)')
    .eq('exercise_id', exerciseId)
    .eq('workout_sessions.user_id', userId)
    .order('performed_at', { ascending: false })
    .limit(60);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as (ExerciseSetRow & {
    workout_sessions: { started_at: string };
  })[];

  const bySession = new Map<string, { performedAt: string; sets: ExerciseSetRow[] }>();
  for (const { workout_sessions, ...row } of rows) {
    const bucket = bySession.get(row.workout_session_id) ?? {
      performedAt: workout_sessions.started_at,
      sets: [],
    };
    bucket.sets.push(row);
    bySession.set(row.workout_session_id, bucket);
  }

  return [...bySession.entries()]
    .map(([sessionId, value]) => ({
      sessionId,
      performedAt: value.performedAt,
      sets: value.sets.slice().sort((a, b) => a.set_index - b.set_index),
    }))
    .sort((a, b) => b.performedAt.localeCompare(a.performedAt))
    .slice(0, sessionLimit);
}

// ---------------------------------------------------------------------------
// Domain mapping
// ---------------------------------------------------------------------------

export function toPerformedSets(sessions: readonly FullSession[]): PerformedSet[] {
  return sessions.flatMap((session) =>
    session.sets.map((set) => ({
      exerciseId: set.exercise_id,
      setType: set.set_type,
      isCompleted: set.is_completed,
      performedOn: set.performed_at.slice(0, 10) as IsoDate,
      reps: set.reps === null ? null : Number(set.reps),
    })),
  );
}

/** Sets in the shape the strength-progress and stall analyses consume. */
export function toStrengthSets(sessions: readonly FullSession[]): StrengthSet[] {
  return sessions.flatMap((session) =>
    session.sets.map((set) => ({
      exerciseId: set.exercise_id,
      weightKg: set.weight_kg === null ? null : Number(set.weight_kg),
      reps: set.reps === null ? null : Number(set.reps),
      setType: set.set_type,
      isCompleted: set.is_completed,
      performedOn: set.performed_at.slice(0, 10) as IsoDate,
    })),
  );
}

export function toLoggedSets(sets: readonly ExerciseSetRow[]): LoggedSet[] {
  return sets
    .filter((set) => set.set_type !== 'warmup')
    .map((set) => ({
      weightKg: set.weight_kg === null ? null : Number(set.weight_kg),
      reps: set.reps === null ? null : Number(set.reps),
      rir: set.rir === null ? null : Number(set.rir),
      isCompleted: set.is_completed,
      techniqueBreakdown: set.technique_breakdown,
      painReported: set.pain_reported,
    }));
}

export function toMuscleBands(
  muscles: readonly MuscleRow[],
): Partial<Record<MuscleId, { minSets: number; maxSets: number }>> {
  return Object.fromEntries(
    muscles.map((muscle) => [
      muscle.id,
      { minSets: muscle.default_weekly_sets_min, maxSets: muscle.default_weekly_sets_max },
    ]),
  );
}
