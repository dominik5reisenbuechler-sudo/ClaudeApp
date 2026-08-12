/**
 * The `HealthProvider` interface (ARCHITECTURE.md ADR-003).
 *
 * Apple Health and Health Connect are different enough that writing against
 * either directly would spread platform conditionals through the app. Neither
 * the UI nor the domain layer names them: they ask a provider what it can do
 * and read samples in one shape.
 *
 * Three things are deliberate in the shape below:
 *
 * **Capabilities are declared, not assumed.** Health Connect exposes resting
 * heart rate; HealthKit exposes it differently and a watchless iPhone user has
 * none at all. A screen that asks `capabilities()` can hide what is not there
 * instead of showing a permanently empty chart.
 *
 * **Permissions are per-metric and requested explicitly.** Health data is the
 * most sensitive category this app touches (CLAUDE.md §56). Nothing is read
 * without the user asking for that specific thing to be read, and there is no
 * "request everything on launch" path here to make that easy to get wrong.
 *
 * **Writing back is optional and separate.** Reading someone's weight and
 * writing to their permanent health record are different acts, and a provider
 * that can do the first is not assumed to be allowed the second.
 */

import type {
  HealthSampleSource,
  HealthStepSample,
  HealthWeightSample,
} from '@/domain/health/reconcile';
import type { IsoDate } from '@/types/domain';

/**
 * The sample shapes live in the domain, because reconciling them with the
 * user's own logs is where the thinking is. Providers map their platform's
 * representation into these.
 */
export type { HealthSampleSource, HealthStepSample, HealthWeightSample };

export type HealthProviderId = 'healthkit' | 'health_connect' | 'none';

export type HealthMetric =
  | 'weight'
  | 'body_fat'
  | 'steps'
  | 'active_energy'
  | 'workouts'
  | 'sleep'
  | 'resting_heart_rate';

export const HEALTH_METRIC_LABELS: Record<HealthMetric, string> = {
  weight: 'Bodyweight',
  body_fat: 'Body fat percentage',
  steps: 'Steps',
  active_energy: 'Active energy',
  workouts: 'Workouts',
  sleep: 'Sleep',
  resting_heart_rate: 'Resting heart rate',
};

export type PermissionStatus = 'granted' | 'denied' | 'undetermined' | 'unsupported';

export type HealthPermissionState = Record<HealthMetric, PermissionStatus>;

export interface HealthProvider {
  readonly id: HealthProviderId;
  readonly label: string;

  /** Whether this platform has a health store at all. */
  isAvailable(): Promise<boolean>;

  /** What this provider could read, if permitted. */
  capabilities(): readonly HealthMetric[];

  getPermissions(): Promise<HealthPermissionState>;

  /**
   * Ask for exactly the metrics named. Returns the resulting state rather than
   * a boolean, because a partial grant is the normal outcome and the app has
   * to be able to work with it.
   */
  requestPermissions(metrics: readonly HealthMetric[]): Promise<HealthPermissionState>;

  readWeights(from: IsoDate, to: IsoDate): Promise<HealthWeightSample[]>;
  readSteps(from: IsoDate, to: IsoDate): Promise<HealthStepSample[]>;

  /** Present only on providers that can write back, and only when permitted. */
  writeWeight?(sample: { date: IsoDate; weightKg: number }): Promise<void>;
}

export const NO_PERMISSIONS: HealthPermissionState = {
  weight: 'unsupported',
  body_fat: 'unsupported',
  steps: 'unsupported',
  active_energy: 'unsupported',
  workouts: 'unsupported',
  sleep: 'unsupported',
  resting_heart_rate: 'unsupported',
};
