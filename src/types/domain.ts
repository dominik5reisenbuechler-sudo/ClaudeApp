/**
 * Shared domain vocabulary.
 *
 * These string-literal unions mirror the Postgres enum types defined in
 * `supabase/migrations/0002_enums.sql`. Keeping them as literal unions (rather
 * than TS enums) means they serialise directly to and from the database with no
 * mapping layer, and exhaustiveness is checked by the compiler.
 */

export const SEXES = ['male', 'female'] as const;
export type Sex = (typeof SEXES)[number];

export const GOAL_TYPES = ['lean_bulk', 'recomposition', 'cut', 'maintenance'] as const;
export type GoalType = (typeof GOAL_TYPES)[number];

export const ACTIVITY_LEVELS = ['sedentary', 'light', 'moderate', 'high', 'very_high'] as const;
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];

export const OCCUPATION_ACTIVITIES = ['desk', 'light', 'active', 'manual'] as const;
export type OccupationActivity = (typeof OCCUPATION_ACTIVITIES)[number];

export const EXPERIENCE_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

export const TRAINING_LOCATIONS = [
  'commercial_gym',
  'home_gym',
  'minimal_equipment',
  'bodyweight',
] as const;
export type TrainingLocation = (typeof TRAINING_LOCATIONS)[number];

export const DIET_TYPES = [
  'omnivore',
  'pescatarian',
  'vegetarian',
  'vegan',
  'halal',
  'kosher',
] as const;
export type DietType = (typeof DIET_TYPES)[number];

export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export const FOOD_SOURCES = ['generic', 'branded', 'user', 'barcode', 'recipe'] as const;
export type FoodSource = (typeof FOOD_SOURCES)[number];

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

/** Supermarket aisles. Order matters for the shopping list — see §23. */
export const INGREDIENT_CATEGORIES = [
  'meat_fish',
  'dairy',
  'eggs',
  'vegetables',
  'fruit',
  'carbs',
  'frozen',
  'canned',
  'spices',
  'other',
] as const;
export type IngredientCategory = (typeof INGREDIENT_CATEGORIES)[number];

export const MOVEMENT_PATTERNS = [
  'horizontal_push',
  'vertical_push',
  'horizontal_pull',
  'vertical_pull',
  'squat',
  'hinge',
  'lunge',
  'carry',
  'isolation',
  'core',
] as const;
export type MovementPattern = (typeof MOVEMENT_PATTERNS)[number];

export const PLAN_STRUCTURES = ['full_body', 'upper_lower', 'push_pull_legs', 'hybrid'] as const;
export type PlanStructure = (typeof PLAN_STRUCTURES)[number];

export const SET_TYPES = ['working', 'warmup', 'backoff', 'drop', 'myo_rep', 'amrap'] as const;
export type SetType = (typeof SET_TYPES)[number];

export const MUSCLE_ROLES = ['primary', 'secondary', 'stabilizer'] as const;
export type MuscleRole = (typeof MUSCLE_ROLES)[number];

export const PR_KINDS = ['estimated_1rm', 'weight_for_reps', 'session_volume'] as const;
export type PrKind = (typeof PR_KINDS)[number];

export const RECOMMENDATION_TYPES = [
  'calorie_adjustment',
  'macro_adjustment',
  'volume_adjustment',
  'deload',
  'exercise_progression',
  'adherence',
  'no_change',
] as const;
export type RecommendationType = (typeof RECOMMENDATION_TYPES)[number];

export const RECOMMENDATION_STATUSES = ['pending', 'accepted', 'rejected', 'expired'] as const;
export type RecommendationStatus = (typeof RECOMMENDATION_STATUSES)[number];

/**
 * How well supported a rule is. `mechanistic` means it follows from physiology
 * rather than from a trial that tested it — an honest label, not a weak one.
 */
export const EVIDENCE_LEVELS = ['strong', 'moderate', 'limited', 'mechanistic'] as const;
export type EvidenceLevel = (typeof EVIDENCE_LEVELS)[number];

export const PLAN_MODES = [
  'balanced',
  'maximum_variety',
  'meal_prep',
  'budget',
  'quick_easy',
  'high_protein',
  'cut_friendly',
  'bulk',
] as const;
export type PlanMode = (typeof PLAN_MODES)[number];

export const UNIT_SYSTEMS = ['metric', 'imperial'] as const;
export type UnitSystem = (typeof UNIT_SYSTEMS)[number];

export const MEAL_PREP_PREFERENCES = ['none', 'some', 'heavy'] as const;
export type MealPrepPreference = (typeof MEAL_PREP_PREFERENCES)[number];

export const TARGET_SOURCES = ['onboarding', 'recommendation', 'manual'] as const;
export type TargetSource = (typeof TARGET_SOURCES)[number];

/**
 * The eighteen muscles the training model tracks. Slugs match `muscles.id`.
 */
export const MUSCLE_IDS = [
  'chest',
  'lats',
  'upper_back',
  'traps',
  'front_delts',
  'side_delts',
  'rear_delts',
  'biceps',
  'triceps',
  'forearms',
  'quads',
  'hamstrings',
  'glutes',
  'adductors',
  'abductors',
  'calves',
  'abs',
  'lower_back',
] as const;
export type MuscleId = (typeof MUSCLE_IDS)[number];

/** 0 = no extra emphasis, 3 = highest priority. Drives volume allocation. */
export type MusclePriority = 0 | 1 | 2 | 3;

export const EQUIPMENT_IDS = [
  'barbell',
  'dumbbell',
  'cable',
  'machine',
  'smith_machine',
  'kettlebell',
  'resistance_band',
  'pull_up_bar',
  'dip_station',
  'bench',
  'bodyweight',
] as const;
export type EquipmentId = (typeof EQUIPMENT_IDS)[number];

export const ALLERGENS = [
  'milk',
  'eggs',
  'fish',
  'shellfish',
  'tree_nuts',
  'peanuts',
  'wheat',
  'soy',
  'sesame',
] as const;
export type Allergen = (typeof ALLERGENS)[number];

/** ISO-8601 calendar date, `YYYY-MM-DD`. Not a timestamp — see DATABASE_SCHEMA.md. */
export type IsoDate = string;

/** Day of week, 1 = Monday … 7 = Sunday (ISO-8601). */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** A macronutrient breakdown in grams, plus the energy it represents. */
export interface MacroTargets {
  energyKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
}

/** A single bodyweight observation. */
export interface WeightPoint {
  date: IsoDate;
  weightKg: number;
}

/**
 * A value that carries how much the app trusts it. Anything derived from sparse
 * or noisy user data should be wrapped in this rather than presented bare.
 */
export interface Confident<T> {
  value: T;
  /** 0 = no confidence, 1 = full confidence. */
  confidence: number;
}
