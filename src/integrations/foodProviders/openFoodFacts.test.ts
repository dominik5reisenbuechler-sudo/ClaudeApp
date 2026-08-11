import { describe, expect, it } from 'vitest';

import {
  createOpenFoodFactsProvider,
  mapOffProduct,
  parseBrand,
  parseServingSize,
} from './openFoodFacts';

/** A realistic, complete Open Food Facts product payload. */
const completeProduct = {
  code: '5000112546415',
  product_name: 'Coca-Cola Original Taste',
  brands: 'Coca-Cola, Coca Cola',
  serving_size: '330 ml',
  serving_quantity: 330,
  nutriments: {
    'energy-kcal_100g': 42,
    proteins_100g: 0,
    carbohydrates_100g: 10.6,
    fat_100g: 0,
    sugars_100g: 10.6,
    sodium_100g: 0.01,
  },
};

describe('mapOffProduct', () => {
  it('maps a complete product', () => {
    const result = mapOffProduct(completeProduct);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.food.name).toBe('Coca-Cola Original Taste');
    expect(result.food.brand).toBe('Coca-Cola');
    expect(result.food.barcode).toBe('5000112546415');
    expect(result.food.caloriesPer100g).toBe(42);
    expect(result.food.carbsPer100g).toBe(10.6);
    expect(result.food.servingSizeG).toBe(330);
  });

  it('never marks crowd-sourced data as verified', () => {
    const result = mapOffProduct(completeProduct);
    expect(result.ok && result.food.verified).toBe(false);
  });

  it('converts sodium from grams to milligrams', () => {
    const result = mapOffProduct(completeProduct);
    expect(result.ok && result.food.sodiumMgPer100g).toBe(10);
  });

  it('leaves a nutrient the product does not report as null, not zero', () => {
    // This product reports no fibre. Recording 0 g would claim knowledge we
    // do not have, and would quietly understate the user's daily fibre gap.
    const result = mapOffProduct(completeProduct);
    expect(result.ok && result.food.fiberPer100g).toBeNull();
    expect(result.ok && result.food.fatPer100g).toBe(0);
  });

  it('reads kilojoules when no kcal figure is present', () => {
    // `energy_100g` is kJ despite the bare name. Treating it as kcal would
    // overstate the product by a factor of 4.2.
    const result = mapOffProduct({
      ...completeProduct,
      nutriments: { ...completeProduct.nutriments, 'energy-kcal_100g': undefined, energy_100g: 180 },
    });
    expect(result.ok).toBe(true);
    expect(result.ok && result.food.caloriesPer100g).toBeCloseTo(43.02, 1);
  });

  it('prefers an explicit kcal value over the kilojoule one', () => {
    const result = mapOffProduct({
      ...completeProduct,
      nutriments: { ...completeProduct.nutriments, energy_100g: 9999 },
    });
    expect(result.ok && result.food.caloriesPer100g).toBe(42);
  });

  it('accepts numbers that arrive as strings', () => {
    const result = mapOffProduct({
      ...completeProduct,
      nutriments: { 'energy-kcal_100g': '42', proteins_100g: '1.5' },
    });
    expect(result.ok && result.food.caloriesPer100g).toBe(42);
    expect(result.ok && result.food.proteinPer100g).toBe(1.5);
  });

  it('treats empty strings and junk as unknown', () => {
    const result = mapOffProduct({
      ...completeProduct,
      nutriments: { 'energy-kcal_100g': 42, proteins_100g: '', fat_100g: 'unknown' },
    });
    expect(result.ok && result.food.proteinPer100g).toBeNull();
    expect(result.ok && result.food.fatPer100g).toBeNull();
  });

  it('fails a product with no energy value, but hands back what it salvaged', () => {
    const result = mapOffProduct({
      code: '5000112546415',
      product_name: 'Mystery Snack',
      brands: 'Acme',
      nutriments: { proteins_100g: 12 },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.reason).toBe('incomplete_data');
    expect(result.partial?.name).toBe('Mystery Snack');
    expect(result.partial?.proteinPer100g).toBe(12);
    expect(result.message).toMatch(/incomplete/i);
  });

  it('fails a product with no usable name', () => {
    const result = mapOffProduct({
      code: '5000112546415',
      product_name: '   ',
      nutriments: { 'energy-kcal_100g': 42 },
    });
    expect(result.ok).toBe(false);
  });

  it('falls back through the alternative name fields', () => {
    const result = mapOffProduct({
      code: '5000112546415',
      product_name: '',
      generic_name: 'Sparkling water',
      nutriments: { 'energy-kcal_100g': 0 },
    });
    expect(result.ok && result.food.name).toBe('Sparkling water');
  });

  it('does not throw on arbitrary junk', () => {
    expect(mapOffProduct(null).ok).toBe(false);
    expect(mapOffProduct('not a product').ok).toBe(false);
    expect(mapOffProduct({}).ok).toBe(false);
    expect(mapOffProduct({ code: 5 }).ok).toBe(false);
  });
});

describe('parseServingSize', () => {
  it('reads the leading quantity', () => {
    expect(parseServingSize('30 g')).toBe(30);
    expect(parseServingSize('1 cup (240 ml)')).toBe(1);
    expect(parseServingSize('12,5 g')).toBe(12.5);
  });

  it('returns null when there is no number', () => {
    expect(parseServingSize('one slice')).toBeNull();
    expect(parseServingSize(undefined)).toBeNull();
    expect(parseServingSize('')).toBeNull();
  });
});

describe('parseBrand', () => {
  it('takes the first brand from the list', () => {
    expect(parseBrand('Coca-Cola, Coca Cola')).toBe('Coca-Cola');
    expect(parseBrand('Aldi')).toBe('Aldi');
  });

  it('returns null when absent', () => {
    expect(parseBrand(undefined)).toBeNull();
    expect(parseBrand('')).toBeNull();
    expect(parseBrand(' , ')).toBeNull();
  });
});

describe('createOpenFoodFactsProvider', () => {
  const jsonResponse = (body: unknown, status = 200): Response =>
    ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

  it('rejects an invalid barcode without making a request', async () => {
    let called = false;
    const provider = createOpenFoodFactsProvider(async () => {
      called = true;
      return jsonResponse({});
    });

    const result = await provider.getFoodByBarcode('5000112546416');
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toBe('invalid_barcode');
    expect(called).toBe(false);
  });

  it('maps a successful barcode lookup', async () => {
    const provider = createOpenFoodFactsProvider(async () =>
      jsonResponse({ status: 1, product: completeProduct }),
    );
    const result = await provider.getFoodByBarcode('5000112546415');
    expect(result.ok && result.food.name).toBe('Coca-Cola Original Taste');
  });

  it('reports not_found for a status-0 envelope', async () => {
    const provider = createOpenFoodFactsProvider(async () => jsonResponse({ status: 0 }));
    const result = await provider.getFoodByBarcode('5000112546415');
    expect(!result.ok && result.reason).toBe('not_found');
  });

  it('reports not_found on a 404', async () => {
    const provider = createOpenFoodFactsProvider(async () => jsonResponse({}, 404));
    const result = await provider.getFoodByBarcode('5000112546415');
    expect(!result.ok && result.reason).toBe('not_found');
  });

  it('reports a network error on a server failure', async () => {
    const provider = createOpenFoodFactsProvider(async () => jsonResponse({}, 503));
    const result = await provider.getFoodByBarcode('5000112546415');
    expect(!result.ok && result.reason).toBe('network_error');
  });

  it('skips a search for a query too short to be meaningful', async () => {
    let called = false;
    const provider = createOpenFoodFactsProvider(async () => {
      called = true;
      return jsonResponse({});
    });
    expect(await provider.searchFoods('a')).toEqual([]);
    expect(called).toBe(false);
  });

  it('drops unmappable search results rather than showing empty rows', async () => {
    const provider = createOpenFoodFactsProvider(async () =>
      jsonResponse({
        products: [completeProduct, { code: '1', product_name: 'No energy listed' }, null],
      }),
    );
    const results = await provider.searchFoods('cola');
    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe('Coca-Cola Original Taste');
  });

  it('carries an attribution string, as the licence requires', () => {
    const provider = createOpenFoodFactsProvider();
    expect(provider.attribution).toMatch(/open food facts/i);
  });
});
