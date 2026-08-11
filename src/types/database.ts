/**
 * Database types for the tables created by migrations 0001–0004.
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
  ActivityLevel,
  DietType,
  ExperienceLevel,
  GoalType,
  IsoDate,
  MealPrepPreference,
  OccupationActivity,
  Sex,
  TargetSource,
  TrainingLocation,
  UnitSystem,
} from './domain';

export type LogSource = 'manual' | 'healthkit' | 'health_connect' | 'smart_scale';
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
      progress_photos: TableDefinition<
        ProgressPhotoRow,
        Insertable<ProgressPhotoRow, 'taken_on' | 'pose'>,
        Updatable<ProgressPhotoRow>
      >;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
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
