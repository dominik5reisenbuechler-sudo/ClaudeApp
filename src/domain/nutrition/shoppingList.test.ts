import { describe, expect, it } from 'vitest';

import {
  buildShoppingList,
  completionSummary,
  groupByCategory,
  suggestPackaging,
  CATEGORY_ORDER,
} from './shoppingList';
import type { PantryEntry, PlannedIngredient } from './shoppingList';

const item = (over: Partial<PlannedIngredient> = {}): PlannedIngredient => ({
  ingredientId: 'chicken_breast',
  name: 'Chicken breast',
  category: 'meat_fish',
  quantity: 200,
  unit: 'g',
  isOptional: false,
  ...over,
});

describe('buildShoppingList', () => {
  it('aggregates the case from the spec', () => {
    // 200 g + 180 g + 220 g of chicken across three meals → one 600 g line.
    const lines = buildShoppingList([
      item({ quantity: 200 }),
      item({ quantity: 180 }),
      item({ quantity: 220 }),
    ]);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      name: 'Chicken breast',
      quantity: 600,
      unit: 'g',
      category: 'meat_fish',
    });
  });

  it('normalises compatible units and promotes past a kilogram', () => {
    const lines = buildShoppingList([
      item({ quantity: 500, unit: 'g' }),
      item({ quantity: 0.5, unit: 'kg' }),
    ]);
    expect(lines[0]).toMatchObject({ quantity: 1, unit: 'kg' });
  });

  it('refuses to merge units it cannot convert between', () => {
    // We do not know what one "piece" of chicken weighs. Guessing would produce
    // a confidently wrong list.
    const lines = buildShoppingList([
      item({ quantity: 200, unit: 'g' }),
      item({ quantity: 2, unit: 'piece' }),
    ]);

    expect(lines).toHaveLength(2);
    expect(lines.map((line) => line.unit).sort()).toEqual(['g', 'piece']);
  });

  it('keeps distinct count units separate', () => {
    const lines = buildShoppingList([
      item({ ingredientId: 'garlic', name: 'Garlic', quantity: 2, unit: 'clove' }),
      item({ ingredientId: 'garlic', name: 'Garlic', quantity: 1, unit: 'piece' }),
    ]);
    expect(lines).toHaveLength(2);
  });

  it('sums an unrecognised unit only with an exact match', () => {
    const lines = buildShoppingList([
      item({ ingredientId: 'stock', name: 'Stock cube', quantity: 1, unit: 'cube' }),
      item({ ingredientId: 'stock', name: 'Stock cube', quantity: 2, unit: 'cube' }),
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.quantity).toBe(3);
  });

  it('keeps different ingredients apart', () => {
    const lines = buildShoppingList([
      item(),
      item({ ingredientId: 'rice', name: 'Rice', category: 'carbs', quantity: 150 }),
    ]);
    expect(lines).toHaveLength(2);
  });

  it('leaves optional ingredients off by default and includes them on request', () => {
    const items = [item(), item({ ingredientId: 'honey', name: 'Honey', isOptional: true })];

    expect(buildShoppingList(items)).toHaveLength(1);
    expect(buildShoppingList(items, [], { includeOptional: true })).toHaveLength(2);
  });

  it('marks a line that exists only because optionals were included', () => {
    const lines = buildShoppingList(
      [item({ ingredientId: 'honey', name: 'Honey', isOptional: true })],
      [],
      { includeOptional: true },
    );
    expect(lines[0]?.fromOptionalOnly).toBe(true);
  });

  it('orders by aisle, then alphabetically inside the aisle', () => {
    const lines = buildShoppingList([
      item({ ingredientId: 'rice', name: 'Rice', category: 'carbs' }),
      item({ ingredientId: 'apple', name: 'Apple', category: 'fruit' }),
      item({ ingredientId: 'beef', name: 'Beef', category: 'meat_fish' }),
      item({ ingredientId: 'chicken', name: 'Chicken', category: 'meat_fish' }),
    ]);

    expect(lines.map((line) => line.name)).toEqual(['Beef', 'Chicken', 'Apple', 'Rice']);
  });

  it('returns nothing for an empty plan', () => {
    expect(buildShoppingList([])).toEqual([]);
  });
});

describe('buildShoppingList — pantry', () => {
  const pantry = (over: Partial<PantryEntry> = {}): PantryEntry => ({
    ingredientId: 'chicken_breast',
    quantity: 200,
    unit: 'g',
    alwaysInStock: false,
    ...over,
  });

  it('subtracts what is already in the pantry', () => {
    const lines = buildShoppingList([item({ quantity: 600 })], [pantry({ quantity: 200 })]);
    expect(lines[0]?.quantity).toBe(400);
    expect(lines[0]?.coveredByPantry).toBe(200);
  });

  it('converts across compatible units when subtracting', () => {
    const lines = buildShoppingList(
      [item({ quantity: 600 })],
      [pantry({ quantity: 0.25, unit: 'kg' })],
    );
    expect(lines[0]?.quantity).toBe(350);
  });

  it('drops a line the pantry fully covers', () => {
    expect(buildShoppingList([item({ quantity: 150 })], [pantry({ quantity: 200 })])).toEqual([]);
  });

  it('drops staples marked always in stock', () => {
    // Nobody wants salt on the list every single week.
    const lines = buildShoppingList(
      [item({ ingredientId: 'salt', name: 'Salt', category: 'spices', quantity: 2, unit: 'tsp' })],
      [pantry({ ingredientId: 'salt', alwaysInStock: true, quantity: null, unit: null })],
    );
    expect(lines).toEqual([]);
  });

  it('ignores a pantry entry it cannot convert, rather than guessing', () => {
    // Under-buying because of a bad conversion means a meal that cannot be
    // cooked — the safe failure is to buy the full amount.
    const lines = buildShoppingList(
      [item({ quantity: 600, unit: 'g' })],
      [pantry({ quantity: 2, unit: 'piece' })],
    );
    expect(lines[0]?.quantity).toBe(600);
    expect(lines[0]?.coveredByPantry).toBeNull();
  });

  it('ignores a pantry row with no quantity that is not a staple', () => {
    const lines = buildShoppingList(
      [item({ quantity: 600 })],
      [pantry({ quantity: null, unit: null, alwaysInStock: false })],
    );
    expect(lines[0]?.quantity).toBe(600);
  });

  it('leaves untracked ingredients untouched', () => {
    const lines = buildShoppingList([item({ quantity: 600 })], [pantry({ ingredientId: 'rice' })]);
    expect(lines[0]?.quantity).toBe(600);
  });
});

describe('groupByCategory', () => {
  it('groups into aisles and omits the empty ones', () => {
    const lines = buildShoppingList([
      item(),
      item({ ingredientId: 'rice', name: 'Rice', category: 'carbs' }),
    ]);
    const groups = groupByCategory(lines);

    expect(groups.map((group) => group.category)).toEqual(['meat_fish', 'carbs']);
    expect(groups[0]?.label).toBe('Meat & Fish');
  });

  it('returns nothing for an empty list', () => {
    expect(groupByCategory([])).toEqual([]);
  });

  it('covers every category in the ordering', () => {
    expect(new Set(CATEGORY_ORDER).size).toBe(CATEGORY_ORDER.length);
  });
});

describe('completionSummary', () => {
  it('produces the n / m readout', () => {
    const items = Array.from({ length: 24 }, (_, index) => ({ isChecked: index < 17 }));
    const summary = completionSummary(items);

    expect(summary.label).toBe('17 / 24');
    expect(summary.checked).toBe(17);
    expect(summary.isComplete).toBe(false);
  });

  it('reports completion only when everything is ticked', () => {
    expect(completionSummary([{ isChecked: true }, { isChecked: true }]).isComplete).toBe(true);
    expect(completionSummary([{ isChecked: true }, { isChecked: false }]).isComplete).toBe(false);
  });

  it('is not complete when there is nothing to buy', () => {
    expect(completionSummary([]).isComplete).toBe(false);
    expect(completionSummary([]).label).toBe('0 / 0');
  });
});

describe('suggestPackaging', () => {
  it('covers the requirement with whole packs and reports the leftover', () => {
    // 920 g of chicken from 500 g packs → 2 packs, 80 g left over.
    expect(suggestPackaging(920, 'g', [500])).toEqual({
      packSize: 500,
      count: 2,
      leftover: 80,
    });
  });

  it('picks the largest available pack', () => {
    expect(suggestPackaging(1200, 'g', [300, 500, 1000])?.packSize).toBe(1000);
  });

  it('returns null when no pack sizes are known', () => {
    expect(suggestPackaging(920, 'g', [])).toBeNull();
  });

  it('returns null for a unit it cannot reason about', () => {
    expect(suggestPackaging(3, 'bunch', [500])).toBeNull();
  });
});
