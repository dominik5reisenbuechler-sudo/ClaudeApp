import { z } from 'zod';

import { isValidBarcode, normalizeBarcode } from './barcode';
import { LOOKUP_FAILURE_MESSAGES } from './types';
import type { FoodLookupResult, FoodProvider, ProviderFood } from './types';

/**
 * Open Food Facts provider.
 *
 * The data is crowd-sourced and open-licensed, which means two things this
 * module has to take seriously: attribution is required, and the numbers are
 * frequently incomplete or plain wrong. Every field is therefore parsed
 * defensively and the mapping is a pure function so it can be tested against
 * the shapes the API actually returns, rather than the shapes it documents.
 */

const API_BASE = 'https://world.openfoodfacts.org';

/** Open Food Facts asks API clients to identify themselves. */
const USER_AGENT = 'AdaptiveCoach/0.1 (https://github.com/adaptive-coach)';

const KJ_PER_KCAL = 4.184;

/**
 * Numbers arrive as numbers, as numeric strings, as empty strings, and
 * occasionally as nonsense. Anything that is not a finite number becomes
 * `undefined` — which downstream becomes `null`, meaning "unknown".
 */
const numeric = z.preprocess((value) => {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = typeof value === 'string' ? Number.parseFloat(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : undefined;
}, z.number().optional());

const nutrimentsSchema = z.object({
  'energy-kcal_100g': numeric,
  'energy-kj_100g': numeric,
  energy_100g: numeric,
  proteins_100g: numeric,
  carbohydrates_100g: numeric,
  fat_100g: numeric,
  fiber_100g: numeric,
  sugars_100g: numeric,
  sodium_100g: numeric,
});

const productSchema = z.object({
  code: z.string().optional(),
  product_name: z.string().optional(),
  product_name_en: z.string().optional(),
  generic_name: z.string().optional(),
  brands: z.string().optional(),
  quantity: z.string().optional(),
  serving_quantity: numeric,
  serving_size: z.string().optional(),
  nutriments: nutrimentsSchema.optional(),
});

export type OffProduct = z.input<typeof productSchema>;

/**
 * Energy in kcal per 100 g.
 *
 * `energy_100g` is kilojoules in Open Food Facts, despite the bare name. Taking
 * it as kilocalories would overstate every such product by a factor of 4.2,
 * which is the single most damaging mistake this module could make.
 */
function readEnergyKcal(nutriments: z.infer<typeof nutrimentsSchema>): number | null {
  const kcal = nutriments['energy-kcal_100g'];
  if (kcal !== undefined) return round2(kcal);

  const kj = nutriments['energy-kj_100g'] ?? nutriments.energy_100g;
  if (kj !== undefined) return round2(kj / KJ_PER_KCAL);

  return null;
}

/** Leading quantity of a serving string: "30 g" → 30, "1 cup (240 ml)" → 1. */
export function parseServingSize(serving: string | undefined): number | null {
  if (!serving) return null;
  const match = /(\d+(?:[.,]\d+)?)/.exec(serving);
  if (!match?.[1]) return null;
  const value = Number.parseFloat(match[1].replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** First brand from Open Food Facts' comma-separated list. */
export function parseBrand(brands: string | undefined): string | null {
  if (!brands) return null;
  const first = brands.split(',')[0]?.trim();
  return first && first.length > 0 ? first : null;
}

function readName(product: z.infer<typeof productSchema>): string | null {
  for (const candidate of [product.product_name, product.product_name_en, product.generic_name]) {
    const trimmed = candidate?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

/**
 * Map one API product to a `ProviderFood`.
 *
 * Pure, so it can be tested against real response shapes without a network. A
 * product missing its name or its energy value is a failure rather than a food
 * with zeros in it — but the salvageable parts come back in `partial` so the
 * user can finish it by hand instead of typing everything.
 */
export function mapOffProduct(raw: unknown): FoodLookupResult {
  const parsed = productSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      reason: 'incomplete_data',
      message: LOOKUP_FAILURE_MESSAGES.incomplete_data,
    };
  }

  const product = parsed.data;
  const nutriments = product.nutriments ?? {};

  const name = readName(product);
  const energyKcal = readEnergyKcal(nutriments);
  const barcode = product.code ? normalizeBarcode(product.code) : null;

  const partial: Partial<ProviderFood> = {
    ...(product.code ? { externalId: product.code } : {}),
    ...(name ? { name } : {}),
    brand: parseBrand(product.brands),
    barcode,
    proteinPer100g: nutriments.proteins_100g ?? null,
    carbsPer100g: nutriments.carbohydrates_100g ?? null,
    fatPer100g: nutriments.fat_100g ?? null,
    fiberPer100g: nutriments.fiber_100g ?? null,
  };

  if (!name || energyKcal === null || !product.code) {
    return {
      ok: false,
      reason: 'incomplete_data',
      partial,
      message: LOOKUP_FAILURE_MESSAGES.incomplete_data,
    };
  }

  return {
    ok: true,
    food: {
      externalId: product.code,
      name,
      brand: parseBrand(product.brands),
      barcode,
      servingSizeG: product.serving_quantity ?? parseServingSize(product.serving_size),
      servingLabel: product.serving_size?.trim() ?? null,
      caloriesPer100g: energyKcal,
      proteinPer100g: nutriments.proteins_100g ?? null,
      carbsPer100g: nutriments.carbohydrates_100g ?? null,
      fatPer100g: nutriments.fat_100g ?? null,
      fiberPer100g: nutriments.fiber_100g ?? null,
      sugarPer100g: nutriments.sugars_100g ?? null,
      // Open Food Facts reports sodium in grams per 100 g.
      sodiumMgPer100g:
        nutriments.sodium_100g === undefined ? null : round2(nutriments.sodium_100g * 1000),
      // Crowd-sourced: never presented as verified.
      verified: false,
    },
  };
}

export function createOpenFoodFactsProvider(fetchImpl: typeof fetch = fetch): FoodProvider {
  const headers = { 'User-Agent': USER_AGENT, Accept: 'application/json' };

  return {
    id: 'open_food_facts',
    attribution: 'Product data from Open Food Facts, available under the ODbL.',

    async searchFoods(query, options) {
      const trimmed = query.trim();
      if (trimmed.length < 2) return [];

      const url = new URL('/cgi/search.pl', API_BASE);
      url.searchParams.set('search_terms', trimmed);
      url.searchParams.set('search_simple', '1');
      url.searchParams.set('action', 'process');
      url.searchParams.set('json', '1');
      url.searchParams.set('page_size', String(options?.limit ?? 20));
      // Only the fields we map, so a search does not pull megabytes per result.
      url.searchParams.set(
        'fields',
        'code,product_name,product_name_en,generic_name,brands,quantity,serving_quantity,serving_size,nutriments',
      );

      const response = await fetchImpl(url.toString(), {
        headers,
        ...(options?.signal ? { signal: options.signal } : {}),
      });
      if (!response.ok) throw new Error(`Open Food Facts search failed (${response.status})`);

      const body: unknown = await response.json();
      const products = z.object({ products: z.array(z.unknown()).optional() }).safeParse(body);
      if (!products.success) return [];

      // Products that cannot be mapped are dropped rather than surfaced as
      // half-empty rows: a search result the user cannot log is just noise.
      return (products.data.products ?? [])
        .map(mapOffProduct)
        .filter((result): result is { ok: true; food: ProviderFood } => result.ok)
        .map((result) => result.food);
    },

    async getFoodByBarcode(barcode, options) {
      const digits = normalizeBarcode(barcode);
      if (!isValidBarcode(digits)) {
        return {
          ok: false,
          reason: 'invalid_barcode',
          message: LOOKUP_FAILURE_MESSAGES.invalid_barcode,
        };
      }

      const url = `${API_BASE}/api/v2/product/${digits}.json`;
      const response = await fetchImpl(url, {
        headers,
        ...(options?.signal ? { signal: options.signal } : {}),
      });

      if (response.status === 404) {
        return { ok: false, reason: 'not_found', message: LOOKUP_FAILURE_MESSAGES.not_found };
      }
      if (!response.ok) {
        return {
          ok: false,
          reason: 'network_error',
          message: LOOKUP_FAILURE_MESSAGES.network_error,
        };
      }

      const body: unknown = await response.json();
      const envelope = z
        .object({ status: z.number().optional(), product: z.unknown().optional() })
        .safeParse(body);

      if (!envelope.success || envelope.data.status === 0 || envelope.data.product === undefined) {
        return { ok: false, reason: 'not_found', message: LOOKUP_FAILURE_MESSAGES.not_found };
      }

      return mapOffProduct(envelope.data.product);
    },
  };
}

const round2 = (value: number): number => Math.round(value * 100) / 100;
