import { createOpenFoodFactsProvider } from './openFoodFacts';
import type { FoodProvider } from './types';

/**
 * Provider registry.
 *
 * One place decides which implementation the app uses, so swapping provider —
 * or adding a second one to fall back to — is a change here and nowhere else.
 */

let provider: FoodProvider | null = null;

export function getFoodProvider(): FoodProvider {
  provider ??= createOpenFoodFactsProvider();
  return provider;
}

/** Test/debug seam for substituting a provider. */
export function setFoodProvider(next: FoodProvider): void {
  provider = next;
}

export { LOOKUP_FAILURE_MESSAGES } from './types';
export type { FoodLookupResult, FoodProvider, ProviderFood } from './types';
export { isValidBarcode, normalizeBarcode, toEan13 } from './barcode';
