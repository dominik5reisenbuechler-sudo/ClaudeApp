-- 0002 — Enum types.
--
-- Enums rather than text + check constraints: an invalid value becomes
-- unrepresentable rather than merely rejected, and the type is visible to
-- generated client types. These mirror the string-literal unions in
-- src/types/domain.ts exactly — the two must be changed together.

create type public.sex as enum ('male', 'female');

create type public.goal_type as enum ('lean_bulk', 'recomposition', 'cut', 'maintenance');

create type public.activity_level as enum ('sedentary', 'light', 'moderate', 'high', 'very_high');

create type public.occupation_activity as enum ('desk', 'light', 'active', 'manual');

create type public.experience_level as enum ('beginner', 'intermediate', 'advanced');

create type public.training_location as enum (
  'commercial_gym', 'home_gym', 'minimal_equipment', 'bodyweight'
);

create type public.diet_type as enum (
  'omnivore', 'pescatarian', 'vegetarian', 'vegan', 'halal', 'kosher'
);

create type public.meal_prep_preference as enum ('none', 'some', 'heavy');

create type public.unit_system as enum ('metric', 'imperial');

create type public.target_source as enum ('onboarding', 'recommendation', 'manual');

create type public.measurement_site as enum (
  'waist', 'chest', 'arm', 'thigh', 'hip', 'calf', 'neck', 'shoulders'
);

create type public.log_source as enum ('manual', 'healthkit', 'health_connect', 'smart_scale');

create type public.consent_kind as enum ('terms', 'privacy', 'health_data', 'analytics');
