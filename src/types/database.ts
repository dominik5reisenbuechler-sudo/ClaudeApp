/**
 * Database types for the tables created by migrations 0001–0010.
 *
 * Hand-maintained rather than generated, for now: `supabase gen types` needs a
 * live project, and a checked-in generated file that nobody can regenerate is
 * worse than a deliberate one. The shape matches what the generator produces,
 * so switching to generation later is a drop-in replacement.
 *
 * Keep in step with:
 *   - supabase/migrations/**
 *   - src/types/domain.ts (the enum unions must match the Postgres enums)
 */

import type {
  AchievementCategory,
  ActivityLevel,
  DietType,
  Difficulty,
  EvidenceLevel,
  ExperienceLevel,
  FoodSource,
  GoalType,
  IngredientCategory,
  IsoDate,
  LogSource,
  MealPrepPreference,
  MealType,
  MovementPattern,
  MuscleId,
  MuscleRole,
  OccupationActivity,
  PlanMode,
  PlanStructure,
  PrKind,
  RecommendationStatus,
  RecommendationType,
  SetType,
  Sex,
  StreakKind,
  XpKind,
  TargetSource,
  TrainingLocation,
  UnitSystem,
} from './domain';

export type MeasurementSite =
  | 'waist'
  | 'chest'
  | 'arm'
  | 'thigh'
  | 'hip'
  | 'calf'
  | 'neck'
  | 'shoulders';
export type ConsentKind = 'terms' | 'privacy' | 'health_data' | 'analytics';

export type { IngredientCategory, LogSource, PlanMode };

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

/** Columns the database fills in and the client never writes. */
type Timestamps = {
  created_at: string;
  updated_at: string;
};

export type ProfileRow = Timestamps & {
  id: string;
  display_name: string | null;
  birth_date: IsoDate | null;
  sex: Sex | null;
  height_cm: number | null;
  unit_system: UnitSystem;
  locale: string;
  timezone: string;
  onboarding_completed_at: string | null;
  accepted_terms_at: string | null;
  health_data_consent_at: string | null;
}

export type UserPreferencesRow = Timestamps & {
  user_id: string;

  experience: ExperienceLevel | null;
  training_location: TrainingLocation | null;
  training_days_per_week: number | null;
  preferred_training_days: number[];
  session_minutes: number | null;
  available_equipment: string[];
  injury_notes: string | null;
  muscle_priorities: Json;

  activity_level: ActivityLevel | null;
  occupation_activity: OccupationActivity | null;
  average_daily_steps: number | null;
  average_sleep_hours: number | null;

  diet_type: DietType | null;
  allergens: string[];
  intolerances: string[];
  disliked_foods: string[];
  preferred_foods: string[];
  meals_per_day: number | null;
  meal_prep_preference: MealPrepPreference | null;
  max_cook_minutes: number | null;
  weekly_food_budget: number | null;
  budget_currency: string | null;
  variety_preference: number | null;

  is_pregnant_or_breastfeeding: boolean;
  has_medical_condition: boolean;
  medical_condition_notes: string | null;
  eating_disorder_risk: boolean;
  reports_acute_symptoms: boolean;
}

export type UserGoalRow = Timestamps & {
  id: string;
  user_id: string;
  goal: GoalType;
  target_weight_kg: number | null;
  target_rate_pct_per_week: number | null;
  started_on: IsoDate;
  ended_on: IsoDate | null;
}

export type UserTargetRow = Timestamps & {
  id: string;
  user_id: string;
  energy_kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  step_goal: number;
  basis: Json;
  source: TargetSource;
  effective_from: IsoDate;
  effective_to: IsoDate | null;
}

export type UserConsentRow = {
  id: string;
  user_id: string;
  kind: ConsentKind;
  granted: boolean;
  policy_version: string;
  granted_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export type WeightLogRow = Timestamps & {
  id: string;
  user_id: string;
  logged_on: IsoDate;
  weight_kg: number;
  source: LogSource;
  note: string | null;
}

export type BodyMeasurementRow = Timestamps & {
  id: string;
  user_id: string;
  measured_on: IsoDate;
  site: MeasurementSite;
  value_cm: number;
}

export type StepLogRow = Timestamps & {
  id: string;
  user_id: string;
  logged_on: IsoDate;
  steps: number;
  source: LogSource;
}

export type ActivityLogRow = Timestamps & {
  id: string;
  user_id: string;
  logged_on: IsoDate;
  activity: string;
  minutes: number;
  estimated_kcal: number | null;
  source: LogSource;
}

export type RecoveryLogRow = Timestamps & {
  id: string;
  user_id: string;
  logged_on: IsoDate;
  sleep_hours: number | null;
  sleep_quality: number | null;
  stress: number | null;
  motivation: number | null;
  joint_discomfort: number | null;
  soreness: Json;
  resting_hr: number | null;
  hrv_ms: number | null;
}

export type ProgressPhotoRow = {
  id: string;
  user_id: string;
  taken_on: IsoDate;
  storage_path: string;
  pose: string | null;
  created_at: string;
}

/**
 * Foods. Every macro column except `calories_per_100g` is nullable — external
 * product data is routinely incomplete, and null means "unknown", never zero.
 */
export type FoodRow = Timestamps & {
  id: string;
  name: string;
  brand: string | null;
  barcode: string | null;
  serving_size: number | null;
  serving_unit: string | null;
  calories_per_100g: number;
  protein_per_100g: number | null;
  carbs_per_100g: number | null;
  fat_per_100g: number | null;
  fiber_per_100g: number | null;
  sugar_per_100g: number | null;
  sodium_mg_per_100g: number | null;
  source: FoodSource;
  verified: boolean;
  is_public: boolean;
  created_by: string | null;
  external_id: string | null;
  provider: string | null;
}

/**
 * A logged food. The macro columns are a SNAPSHOT taken at log time, not a
 * live join — correcting a food must not rewrite what the user ate last month.
 */
export type FoodEntryRow = Timestamps & {
  id: string;
  user_id: string;
  logged_on: IsoDate;
  meal_type: MealType;
  food_id: string | null;
  saved_meal_id: string | null;
  recipe_id: string | null;
  quantity: number;
  unit: string;
  display_name: string;
  energy_kcal: number;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  sort_order: number;
  note: string | null;
}

export type SavedMealRow = Timestamps & {
  id: string;
  user_id: string;
  name: string;
  meal_type: MealType | null;
}

export type SavedMealItemRow = {
  id: string;
  saved_meal_id: string;
  food_id: string;
  quantity_g: number;
  sort_order: number;
  created_at: string;
}

export type FoodFavoriteRow = {
  user_id: string;
  food_id: string;
  created_at: string;
}

export type IngredientRow = Timestamps & {
  id: string;
  slug: string;
  name: string;
  category: IngredientCategory;
  default_unit: string;
  density_g_per_ml: number | null;
  package_sizes: number[];
  food_id: string | null;
  allergens: string[];
}

/** Per-serving macros are authored values; energy required, rest nullable. */
export type RecipeRow = Timestamps & {
  id: string;
  slug: string | null;
  title: string;
  description: string | null;
  image_path: string | null;
  meal_type: MealType;
  prep_minutes: number;
  cook_minutes: number;
  difficulty: Difficulty;
  servings: number;
  calories_per_serving: number;
  protein_per_serving: number | null;
  carbs_per_serving: number | null;
  fat_per_serving: number | null;
  fiber_per_serving: number | null;
  dietary_tags: string[];
  allergens: string[];
  meal_prep_rating: number;
  cost_band: number;
  source: string;
  source_url: string | null;
  is_public: boolean;
  created_by: string | null;
}

export type RecipeIngredientRow = {
  id: string;
  recipe_id: string;
  ingredient_id: string;
  quantity: number;
  unit: string;
  preparation_note: string | null;
  is_scalable: boolean;
  is_optional: boolean;
  sort_order: number;
  created_at: string;
}

export type RecipeInstructionRow = {
  id: string;
  recipe_id: string;
  step_number: number;
  instruction: string;
  created_at: string;
}

export type UserRecipeFavoriteRow = {
  user_id: string;
  recipe_id: string;
  created_at: string;
}

export type MealPlanRow = Timestamps & {
  id: string;
  user_id: string;
  /** Always a Monday — enforced by a check constraint. */
  week_start_date: IsoDate;
  name: string | null;
  mode: PlanMode | null;
  generated_at: string | null;
  generation_params: Json;
}

export type MealPlanDayRow = {
  id: string;
  meal_plan_id: string;
  day_index: number;
  day_date: IsoDate;
  created_at: string;
}

export type MealPlanEntryRow = Timestamps & {
  id: string;
  meal_plan_day_id: string;
  meal_type: MealType;
  recipe_id: string | null;
  saved_meal_id: string | null;
  servings: number;
  sort_order: number;
}

export type PantryItemRow = Timestamps & {
  id: string;
  user_id: string;
  ingredient_id: string;
  quantity: number | null;
  unit: string | null;
  always_in_stock: boolean;
}

export type ShoppingListRow = Timestamps & {
  id: string;
  user_id: string;
  meal_plan_id: string | null;
  name: string | null;
  generated_at: string;
}

export type MuscleRow = {
  id: MuscleId;
  name: string;
  region: string;
  default_weekly_sets_min: number;
  default_weekly_sets_max: number;
  sort_order: number;
  created_at: string;
}

export type ExerciseRow = Timestamps & {
  id: string;
  name: string;
  equipment: string;
  movement_pattern: MovementPattern;
  difficulty: Difficulty;
  rep_range_min: number;
  rep_range_max: number;
  load_increment_kg: number;
  default_rest_seconds: number;
  instructions: string[];
  common_mistakes: string[];
  rom_notes: string | null;
  fatigue_rating: number | null;
  stability_rating: number | null;
  video_url: string | null;
  is_public: boolean;
  created_by: string | null;
}

/** The fractional set model — data, not a constant in code (CLAUDE.md §31). */
export type ExerciseMuscleRow = {
  exercise_id: string;
  muscle_id: MuscleId;
  role: MuscleRole;
  set_credit: number;
}

export type ExerciseAlternativeRow = {
  exercise_id: string;
  alternative_id: string;
  similarity: number;
}

export type WorkoutPlanRow = Timestamps & {
  id: string;
  user_id: string;
  name: string;
  days_per_week: number;
  structure: PlanStructure;
  generated_by: string;
  generation_params: Json;
  started_on: IsoDate;
  ended_on: IsoDate | null;
}

export type WorkoutDayRow = {
  id: string;
  workout_plan_id: string;
  day_index: number;
  name: string;
  target_muscles: string[];
  created_at: string;
}

export type WorkoutExerciseRow = Timestamps & {
  id: string;
  workout_day_id: string;
  exercise_id: string;
  sort_order: number;
  target_sets: number;
  target_rep_min: number;
  target_rep_max: number;
  target_rir: number;
  rest_seconds: number;
  note: string | null;
}

export type WorkoutSessionRow = Timestamps & {
  id: string;
  user_id: string;
  workout_day_id: string | null;
  name: string | null;
  started_at: string;
  completed_at: string | null;
  session_rpe: number | null;
  notes: string | null;
}

export type ExerciseSetRow = Timestamps & {
  id: string;
  workout_session_id: string;
  exercise_id: string;
  set_index: number;
  weight_kg: number | null;
  reps: number | null;
  rir: number | null;
  rpe: number | null;
  set_type: SetType;
  is_completed: boolean;
  technique_breakdown: boolean;
  pain_reported: boolean;
  note: string | null;
  performed_at: string;
}

export type PersonalRecordRow = {
  id: string;
  user_id: string;
  exercise_id: string;
  kind: PrKind;
  value: number;
  reps: number | null;
  weight_kg: number | null;
  achieved_on: IsoDate;
  exercise_set_id: string | null;
  created_at: string;
}

// --- 0009 adaptive engine ---------------------------------------------------

export type WeeklyCheckinRow = Timestamps & {
  id: string;
  user_id: string;
  /** Always a Monday. */
  week_start_date: IsoDate;
  /** 1–5. Null means skipped — a missing answer is not a 3. */
  training_performance: number | null;
  hunger: number | null;
  energy: number | null;
  sleep_quality: number | null;
  stress: number | null;
  diet_adherence: number | null;
  training_satisfaction: number | null;
  /** 0–4. */
  joint_discomfort: number | null;
  notes: string | null;
  /** Snapshot of the objective inputs the engine saw. */
  computed: Json;
}

export type RecommendationRow = Timestamps & {
  id: string;
  user_id: string;
  weekly_checkin_id: string | null;
  type: RecommendationType;
  current_value: Json;
  suggested_value: Json;
  reason: string;
  confidence: number;
  evidence_rule_ids: string[];
  status: RecommendationStatus;
  responded_at: string | null;
}

export type EvidenceRuleRow = {
  id: string;
  category: string;
  rule_key: string;
  recommendation: string;
  minimum_value: number | null;
  maximum_value: number | null;
  unit: string | null;
  evidence_level: EvidenceLevel;
  confidence: number | null;
  source_title: string | null;
  source_url: string | null;
  publication_year: number | null;
  last_reviewed_at: IsoDate | null;
  version: number;
  is_active: boolean;
  created_at: string;
}

// --- 0010 gamification -----------------------------------------------------

export type XpEventRow = {
  id: string;
  user_id: string;
  kind: XpKind;
  xp: number;
  earned_on: IsoDate;
  context: Json;
  /** Distinguishes several awards of the same kind on the same day. */
  dedupe_key: string;
  created_at: string;
}

export type AchievementRow = {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: AchievementCategory;
  /** Mirrors `AchievementMetric` in the domain catalogue. */
  metric: string;
  threshold: number;
  xp_reward: number;
  sort_order: number;
  created_at: string;
}

export type UserAchievementRow = {
  user_id: string;
  achievement_id: string;
  unlocked_on: IsoDate;
  created_at: string;
}

export type ShoppingListItemRow = Timestamps & {
  id: string;
  shopping_list_id: string;
  ingredient_id: string | null;
  display_name: string;
  category: IngredientCategory;
  quantity: number;
  unit: string;
  covered_by_pantry: number | null;
  is_checked: boolean;
  is_manual: boolean;
  sort_order: number;
}

/**
 * Insert/Update shapes: database-generated columns become optional, everything
 * else stays as declared. `Insert` still requires genuinely required columns,
 * so a missing `user_id` is a compile error rather than an RLS rejection.
 */
type GeneratedColumns = 'id' | 'created_at' | 'updated_at';

type Insertable<T, Optional extends keyof T = never> = Omit<
  T,
  Extract<GeneratedColumns, keyof T> | Optional
> &
  Partial<Pick<T, Extract<GeneratedColumns, keyof T> | Optional>>;

type Updatable<T> = Partial<Omit<T, Extract<GeneratedColumns, keyof T>>>;

type TableDefinition<Row, Insert, Update> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
}

export type Database = {
  public: {
    Tables: {
      profiles: TableDefinition<
        ProfileRow,
        Insertable<ProfileRow, 'unit_system' | 'locale' | 'timezone'> & { id: string },
        Updatable<ProfileRow>
      >;
      user_preferences: TableDefinition<
        UserPreferencesRow,
        Insertable<UserPreferencesRow, Exclude<keyof UserPreferencesRow, 'user_id'>>,
        Updatable<UserPreferencesRow>
      >;
      user_goals: TableDefinition<
        UserGoalRow,
        Insertable<UserGoalRow, 'started_on' | 'ended_on' | 'target_weight_kg' | 'target_rate_pct_per_week'>,
        Updatable<UserGoalRow>
      >;
      user_targets: TableDefinition<
        UserTargetRow,
        Insertable<UserTargetRow, 'step_goal' | 'basis' | 'effective_from' | 'effective_to'>,
        Updatable<UserTargetRow>
      >;
      user_consents: TableDefinition<
        UserConsentRow,
        Insertable<UserConsentRow, 'policy_version' | 'granted_at' | 'revoked_at'>,
        Updatable<UserConsentRow>
      >;
      weight_logs: TableDefinition<
        WeightLogRow,
        Insertable<WeightLogRow, 'logged_on' | 'source' | 'note'>,
        Updatable<WeightLogRow>
      >;
      body_measurements: TableDefinition<
        BodyMeasurementRow,
        Insertable<BodyMeasurementRow, 'measured_on'>,
        Updatable<BodyMeasurementRow>
      >;
      step_logs: TableDefinition<
        StepLogRow,
        Insertable<StepLogRow, 'logged_on' | 'source'>,
        Updatable<StepLogRow>
      >;
      activity_logs: TableDefinition<
        ActivityLogRow,
        Insertable<ActivityLogRow, 'logged_on' | 'estimated_kcal' | 'source'>,
        Updatable<ActivityLogRow>
      >;
      recovery_logs: TableDefinition<
        RecoveryLogRow,
        Insertable<RecoveryLogRow, Exclude<keyof RecoveryLogRow, 'user_id' | 'logged_on'>>,
        Updatable<RecoveryLogRow>
      >;
      foods: TableDefinition<
        FoodRow,
        Insertable<
          FoodRow,
          | 'brand' | 'barcode' | 'serving_size' | 'serving_unit'
          | 'protein_per_100g' | 'carbs_per_100g' | 'fat_per_100g' | 'fiber_per_100g'
          | 'sugar_per_100g' | 'sodium_mg_per_100g'
          | 'source' | 'verified' | 'is_public' | 'created_by' | 'external_id' | 'provider'
        >,
        Updatable<FoodRow>
      >;
      food_entries: TableDefinition<
        FoodEntryRow,
        Insertable<
          FoodEntryRow,
          | 'logged_on' | 'food_id' | 'saved_meal_id' | 'recipe_id' | 'unit'
          | 'protein_g' | 'carbs_g' | 'fat_g' | 'fiber_g' | 'sort_order' | 'note'
        >,
        Updatable<FoodEntryRow>
      >;
      saved_meals: TableDefinition<
        SavedMealRow,
        Insertable<SavedMealRow, 'meal_type'>,
        Updatable<SavedMealRow>
      >;
      saved_meal_items: TableDefinition<
        SavedMealItemRow,
        Insertable<SavedMealItemRow, 'sort_order'>,
        Updatable<SavedMealItemRow>
      >;
      food_favorites: TableDefinition<
        FoodFavoriteRow,
        Insertable<FoodFavoriteRow>,
        Updatable<FoodFavoriteRow>
      >;
      ingredients: TableDefinition<
        IngredientRow,
        Insertable<
          IngredientRow,
          'category' | 'default_unit' | 'density_g_per_ml' | 'package_sizes' | 'food_id' | 'allergens'
        >,
        Updatable<IngredientRow>
      >;
      recipes: TableDefinition<
        RecipeRow,
        Insertable<
          RecipeRow,
          | 'slug' | 'description' | 'image_path' | 'prep_minutes' | 'cook_minutes' | 'difficulty'
          | 'protein_per_serving' | 'carbs_per_serving' | 'fat_per_serving' | 'fiber_per_serving'
          | 'dietary_tags' | 'allergens' | 'meal_prep_rating' | 'cost_band'
          | 'source' | 'source_url' | 'is_public' | 'created_by'
        >,
        Updatable<RecipeRow>
      >;
      recipe_ingredients: TableDefinition<
        RecipeIngredientRow,
        Insertable<
          RecipeIngredientRow,
          'unit' | 'preparation_note' | 'is_scalable' | 'is_optional' | 'sort_order'
        >,
        Updatable<RecipeIngredientRow>
      >;
      recipe_instructions: TableDefinition<
        RecipeInstructionRow,
        Insertable<RecipeInstructionRow>,
        Updatable<RecipeInstructionRow>
      >;
      user_recipe_favorites: TableDefinition<
        UserRecipeFavoriteRow,
        Insertable<UserRecipeFavoriteRow>,
        Updatable<UserRecipeFavoriteRow>
      >;
      meal_plans: TableDefinition<
        MealPlanRow,
        Insertable<MealPlanRow, 'name' | 'mode' | 'generated_at' | 'generation_params'>,
        Updatable<MealPlanRow>
      >;
      meal_plan_days: TableDefinition<
        MealPlanDayRow,
        Insertable<MealPlanDayRow>,
        Updatable<MealPlanDayRow>
      >;
      meal_plan_entries: TableDefinition<
        MealPlanEntryRow,
        Insertable<MealPlanEntryRow, 'recipe_id' | 'saved_meal_id' | 'servings' | 'sort_order'>,
        Updatable<MealPlanEntryRow>
      >;
      pantry_items: TableDefinition<
        PantryItemRow,
        Insertable<PantryItemRow, 'quantity' | 'unit' | 'always_in_stock'>,
        Updatable<PantryItemRow>
      >;
      shopping_lists: TableDefinition<
        ShoppingListRow,
        Insertable<ShoppingListRow, 'meal_plan_id' | 'name' | 'generated_at'>,
        Updatable<ShoppingListRow>
      >;
      muscles: TableDefinition<MuscleRow, MuscleRow, Updatable<MuscleRow>>;
      exercises: TableDefinition<
        ExerciseRow,
        Insertable<
          ExerciseRow,
          | 'difficulty' | 'rep_range_min' | 'rep_range_max' | 'load_increment_kg'
          | 'default_rest_seconds' | 'instructions' | 'common_mistakes' | 'rom_notes'
          | 'fatigue_rating' | 'stability_rating' | 'video_url' | 'is_public' | 'created_by'
        > & { id: string },
        Updatable<ExerciseRow>
      >;
      exercise_muscles: TableDefinition<
        ExerciseMuscleRow,
        ExerciseMuscleRow,
        Updatable<ExerciseMuscleRow>
      >;
      exercise_alternatives: TableDefinition<
        ExerciseAlternativeRow,
        ExerciseAlternativeRow,
        Updatable<ExerciseAlternativeRow>
      >;
      workout_plans: TableDefinition<
        WorkoutPlanRow,
        Insertable<WorkoutPlanRow, 'generated_by' | 'generation_params' | 'started_on' | 'ended_on'>,
        Updatable<WorkoutPlanRow>
      >;
      workout_days: TableDefinition<
        WorkoutDayRow,
        Insertable<WorkoutDayRow, 'target_muscles'>,
        Updatable<WorkoutDayRow>
      >;
      workout_exercises: TableDefinition<
        WorkoutExerciseRow,
        Insertable<WorkoutExerciseRow, 'sort_order' | 'target_rir' | 'rest_seconds' | 'note'>,
        Updatable<WorkoutExerciseRow>
      >;
      workout_sessions: TableDefinition<
        WorkoutSessionRow,
        Insertable<
          WorkoutSessionRow,
          'workout_day_id' | 'name' | 'started_at' | 'completed_at' | 'session_rpe' | 'notes'
        >,
        Updatable<WorkoutSessionRow>
      >;
      exercise_sets: TableDefinition<
        ExerciseSetRow,
        Insertable<
          ExerciseSetRow,
          | 'weight_kg' | 'reps' | 'rir' | 'rpe' | 'set_type' | 'is_completed'
          | 'technique_breakdown' | 'pain_reported' | 'note' | 'performed_at'
        >,
        Updatable<ExerciseSetRow>
      >;
      personal_records: TableDefinition<
        PersonalRecordRow,
        Insertable<PersonalRecordRow, 'reps' | 'weight_kg' | 'achieved_on' | 'exercise_set_id'>,
        Updatable<PersonalRecordRow>
      >;
      shopping_list_items: TableDefinition<
        ShoppingListItemRow,
        Insertable<
          ShoppingListItemRow,
          | 'ingredient_id' | 'category' | 'covered_by_pantry'
          | 'is_checked' | 'is_manual' | 'sort_order'
        >,
        Updatable<ShoppingListItemRow>
      >;
      progress_photos: TableDefinition<
        ProgressPhotoRow,
        Insertable<ProgressPhotoRow, 'taken_on' | 'pose'>,
        Updatable<ProgressPhotoRow>
      >;
      weekly_checkins: TableDefinition<
        WeeklyCheckinRow,
        Insertable<
          WeeklyCheckinRow,
          | 'training_performance' | 'hunger' | 'energy' | 'sleep_quality' | 'stress'
          | 'diet_adherence' | 'training_satisfaction' | 'joint_discomfort'
          | 'notes' | 'computed'
        >,
        Updatable<WeeklyCheckinRow>
      >;
      recommendations: TableDefinition<
        RecommendationRow,
        Insertable<
          RecommendationRow,
          | 'weekly_checkin_id' | 'current_value' | 'suggested_value'
          | 'evidence_rule_ids' | 'status' | 'responded_at'
        >,
        Updatable<RecommendationRow>
      >;
      evidence_rules: TableDefinition<
        EvidenceRuleRow,
        Insertable<EvidenceRuleRow, keyof EvidenceRuleRow>,
        Updatable<EvidenceRuleRow>
      >;
      xp_events: TableDefinition<
        XpEventRow,
        Insertable<XpEventRow, 'context' | 'dedupe_key'>,
        Updatable<XpEventRow>
      >;
      achievements: TableDefinition<
        AchievementRow,
        Insertable<AchievementRow, 'xp_reward' | 'sort_order'> & { id: string },
        Updatable<AchievementRow>
      >;
      user_achievements: TableDefinition<
        UserAchievementRow,
        Insertable<UserAchievementRow, 'unlocked_on'>,
        Updatable<UserAchievementRow>
      >;
    };
    Views: Record<string, never>;
    Functions: {
      /** Fuzzy food search — see supabase/migrations/0005_nutrition.sql. */
      search_foods: {
        Args: { search_term: string; max_results?: number };
        Returns: FoodRow[];
      };
    };
    Enums: {
      sex: Sex;
      goal_type: GoalType;
      activity_level: ActivityLevel;
      occupation_activity: OccupationActivity;
      experience_level: ExperienceLevel;
      training_location: TrainingLocation;
      diet_type: DietType;
      meal_prep_preference: MealPrepPreference;
      unit_system: UnitSystem;
      target_source: TargetSource;
      measurement_site: MeasurementSite;
      log_source: LogSource;
      consent_kind: ConsentKind;
      meal_type: MealType;
      food_source: FoodSource;
      difficulty: Difficulty;
      ingredient_category: IngredientCategory;
      meal_plan_mode: PlanMode;
      movement_pattern: MovementPattern;
      plan_structure: PlanStructure;
      set_type: SetType;
      muscle_role: MuscleRole;
      pr_kind: PrKind;
      recommendation_type: RecommendationType;
      recommendation_status: RecommendationStatus;
      evidence_level: EvidenceLevel;
      xp_kind: XpKind;
      streak_kind: StreakKind;
      achievement_category: AchievementCategory;
    };
    CompositeTypes: Record<string, never>;
  };
}

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
export type InsertDto<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];
export type UpdateDto<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];
