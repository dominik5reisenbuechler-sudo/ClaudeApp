/**
 * The food provider contract (ARCHITECTURE.md ADR-003).
 *
 * Neither the UI nor the domain layer ever names Open Food Facts. Everything
 * goes through this interface, so a provider outage, a licence change or a
 * decision to run our own catalogue is a new implementation rather than a
 * refactor of the app.
 */

import type { FoodNutrition } from '@/domain/nutrition/foodMath';

export interface ProviderFood extends FoodNutrition {
  /** Stable id within the provider — the product code, for a barcode source. */
  externalId: string;
  name: string;
  brand: string | null;
  barcode: string | null;
  /** One serving in grams, when the product declares one. */
  servingSizeG: number | null;
  /** The unit as printed on the packet, for display ("30 g", "1 slice"). */
  servingLabel: string | null;
  sugarPer100g: number | null;
  sodiumMgPer100g: number | null;
  /**
   * Crowd-sourced data is never `verified`. The UI shows this, so a user knows
   * whether to trust the numbers or check the label.
   */
  verified: boolean;
}

export type LookupFailureReason =
  | 'not_found'
  | 'incomplete_data'
  | 'invalid_barcode'
  | 'network_error';

export type FoodLookupResult =
  | { ok: true; food: ProviderFood }
  | {
      ok: false;
      reason: LookupFailureReason;
      /**
       * Whatever could be salvaged. A product with a name but no energy value
       * is worth handing to the user to complete by hand — far better than
       * making them type it all from scratch.
       */
      partial?: Partial<ProviderFood>;
      message: string;
    };

export interface FoodProvider {
  readonly id: string;
  /** Shown wherever this provider's data is displayed, as the licence requires. */
  readonly attribution: string;
  searchFoods(query: string, options?: { signal?: AbortSignal; limit?: number }): Promise<ProviderFood[]>;
  getFoodByBarcode(barcode: string, options?: { signal?: AbortSignal }): Promise<FoodLookupResult>;
}

export const LOOKUP_FAILURE_MESSAGES: Record<LookupFailureReason, string> = {
  not_found:
    'We could not find that barcode. You can add the product yourself — it will be saved for next time.',
  incomplete_data:
    'We found the product, but its nutrition data is incomplete. Fill in what the label says and we will save it.',
  invalid_barcode: 'That barcode did not scan cleanly. Try again, or search by name instead.',
  network_error: 'We could not reach the food database. Check your connection and try again.',
};
