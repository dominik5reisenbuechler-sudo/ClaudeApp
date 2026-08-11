import type { ComponentType } from 'react';

import { ActivityStep } from './ActivityStep';
import { BasicsStep } from './BasicsStep';
import { BodyStep } from './BodyStep';
import { DietStep } from './DietStep';
import { EquipmentStep } from './EquipmentStep';
import { ExperienceStep } from './ExperienceStep';
import { GoalStep } from './GoalStep';
import { HealthStep } from './HealthStep';
import { PrioritiesStep } from './PrioritiesStep';
import { RestrictionsStep } from './RestrictionsStep';
import { ReviewStep } from './ReviewStep';
import { ScheduleStep } from './ScheduleStep';
import { WelcomeStep } from './WelcomeStep';
import type { StepScreenProps } from './types';
import type { OnboardingStep } from '../schema';

/**
 * Slug → component. The route resolves the step from the URL through this map,
 * so adding a step means adding a slug to `ONBOARDING_STEPS` and an entry here
 * — the record type makes a missing entry a compile error rather than a blank
 * screen at runtime.
 */
export const STEP_COMPONENTS: Record<OnboardingStep, ComponentType<StepScreenProps>> = {
  welcome: WelcomeStep,
  basics: BasicsStep,
  body: BodyStep,
  activity: ActivityStep,
  experience: ExperienceStep,
  equipment: EquipmentStep,
  schedule: ScheduleStep,
  priorities: PrioritiesStep,
  health: HealthStep,
  diet: DietStep,
  restrictions: RestrictionsStep,
  goal: GoalStep,
  review: ReviewStep,
};

export type { StepScreenProps };
