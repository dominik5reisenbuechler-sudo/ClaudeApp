import type {
  HealthMetric,
  HealthPermissionState,
  HealthProvider,
  HealthStepSample,
  HealthWeightSample,
} from './types';
import { NO_PERMISSIONS } from './types';

/**
 * The provider for platforms with no health store — web, and any build without
 * the native modules linked.
 *
 * It reports itself unavailable and returns nothing, rather than throwing.
 * Every screen already has to handle "this device has no health data" (an
 * Android user without Health Connect installed, a browser), so making the
 * unsupported case an exception would mean every caller wrapping it in a
 * try/catch to arrive back at the same empty state.
 */
export const nullHealthProvider: HealthProvider = {
  id: 'none',
  label: 'Not available on this device',

  isAvailable: async () => false,
  capabilities: () => [],

  getPermissions: async (): Promise<HealthPermissionState> => NO_PERMISSIONS,
  requestPermissions: async (_metrics: readonly HealthMetric[]): Promise<HealthPermissionState> =>
    NO_PERMISSIONS,

  readWeights: async (): Promise<HealthWeightSample[]> => [],
  readSteps: async (): Promise<HealthStepSample[]> => [],
};
