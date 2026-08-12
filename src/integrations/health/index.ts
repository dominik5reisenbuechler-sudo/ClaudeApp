import { Platform } from 'react-native';

import { nullHealthProvider } from './nullProvider';
import type { HealthProvider, HealthProviderId } from './types';

/**
 * Provider registry.
 *
 * **Currently the null provider on every platform**, and that is a deliberate,
 * documented state rather than an oversight.
 *
 * HealthKit and Health Connect are native modules. They cannot run in Expo Go
 * and require a custom development client to build, install and test against a
 * real health store with real permission prompts. Shipping an implementation
 * written blind — never once executed, never once granted a permission — would
 * be worse than shipping none: it would look finished, and it would fail on a
 * user's device rather than in a build.
 *
 * What *is* finished is everything around it. The interface is complete, the
 * reconciliation rules are written and tested (`domain/health/reconcile.ts`),
 * the sync flow, consent gate and settings screen are wired, and the null
 * provider gives them all a working empty state. Adding a platform is one file
 * plus a line here — `capabilities()` maps to the platform's read types,
 * `requestPermissions()` to its authorisation call, and the readers map samples
 * into `HealthWeightSample` / `HealthStepSample`.
 *
 * Smart scales need no separate integration: Withings, Renpho, Eufy and the
 * rest all write into Apple Health or Health Connect, so they arrive through
 * this same path. `reconcileWeights` already marks a hardware reading as
 * `smart_scale` rather than as a phone entry.
 */

let provider: HealthProvider | null = null;

export function getHealthProvider(): HealthProvider {
  provider ??= selectProvider();
  return provider;
}

function selectProvider(): HealthProvider {
  // Left as a switch so adding a platform is a one-line change with the
  // reasoning above it, rather than an if-chain someone has to reverse.
  switch (Platform.OS) {
    case 'ios':
    // HealthKit — see the note above.
    case 'android':
    // Health Connect — likewise.
    default:
      return nullHealthProvider;
  }
}

/** Test/debug seam for substituting a provider. */
export function setHealthProvider(next: HealthProvider): void {
  provider = next;
}

/** The `log_source` value a provider's samples are recorded under. */
export function logSourceFor(id: HealthProviderId): 'healthkit' | 'health_connect' | 'manual' {
  if (id === 'healthkit') return 'healthkit';
  if (id === 'health_connect') return 'health_connect';
  return 'manual';
}

export { nullHealthProvider };
export { HEALTH_METRIC_LABELS, NO_PERMISSIONS } from './types';
export type {
  HealthMetric,
  HealthPermissionState,
  HealthProvider,
  HealthProviderId,
  HealthStepSample,
  HealthWeightSample,
  PermissionStatus,
} from './types';
