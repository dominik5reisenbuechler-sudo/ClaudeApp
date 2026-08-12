/**
 * Turning a week of planned meals into a shopping list.
 *
 * The whole job is aggregation with judgement:
 *
 *   * 200 g + 180 g + 220 g of chicken across three meals is one line reading
 *     600 g — not three lines, and not "0.6 kg" either, because a supermarket
 *     shelf is labelled in grams at that size.
 *
 *   * 500 g + 0.5 kg is 1 kg. Compatible units are normalised.
 *
 *   * 2 pieces + 100 g of the same ingredient are NOT merged. We do not know
 *     what one piece weighs, and inventing a conversion produces a list that is
 *     confidently wrong — worse than one that is slightly verbose.
 *
 * Pantry stock is subtracted, and staples marked `alwaysInStock` disappear
 * entirely: nobody wants salt on the list every week.
 */

import {
  addQuantities,
  areCompatible,
  convert,
  isUnit,
} from '@/utils/units';
import type { Quantity, Unit } from '@/utils/units';
import type { IngredientCategory } from '@/types/domain';

export interface PlannedIngredient {
  ingredientId: string;
  name: string;
  category: IngredientCategory;
  quantity: number;
  unit: string;
  isOptional: boolean;
}

export interface PantryEntry {
  ingredientId: string;
  quantity: number | null;
  unit: string | null;
  alwaysInStock: boolean;
}

export interface ShoppingListLine {
  ingredientId: string;
  name: string;
  category: IngredientCategory;
  quantity: number;
  unit: string;
  /** Amount the pantry already covered, in `unit`. Null when nothing did. */
  coveredByPantry: number | null;
  /** True when the line exists only because optional ingredients were included. */
  fromOptionalOnly: boolean;
}

export interface BuildShoppingListOptions {
  /** Optional recipe ingredients are left off by default. */
  includeOptional?: boolean;
}

/**
 * Display order for the supermarket aisles (CLAUDE.md §23). Fixed rather than
 * alphabetical, because it roughly matches the order you walk a shop.
 */
export const CATEGORY_ORDER: readonly IngredientCategory[] = [
  'meat_fish',
  'dairy',
  'eggs',
  'vegetables',
  'fruit',
  'carbs',
  'frozen',
  'canned',
  'spices',
  'other',
];

export const CATEGORY_LABELS: Record<IngredientCategory, string> = {
  meat_fish: 'Meat & Fish',
  dairy: 'Dairy',
  eggs: 'Eggs',
  vegetables: 'Vegetables',
  fruit: 'Fruit',
  carbs: 'Carbohydrates',
  frozen: 'Frozen',
  canned: 'Canned Foods',
  spices: 'Spices',
  other: 'Other',
};

/**
 * Split one ingredient's quantities into buckets that can legitimately be
 * summed together. Mass merges with mass, volume with volume, and each count
 * unit only with itself. Unknown units bucket by their exact spelling.
 */
function bucketByCompatibility(
  quantities: readonly { quantity: number; unit: string; isOptional: boolean }[],
): { quantity: number; unit: string; isOptional: boolean }[][] {
  const buckets: { quantity: number; unit: string; isOptional: boolean }[][] = [];

  for (const entry of quantities) {
    const bucket = buckets.find((candidate) => {
      const existing = candidate[0];
      if (!existing) return false;
      if (isUnit(existing.unit) && isUnit(entry.unit)) {
        return areCompatible(existing.unit, entry.unit);
      }
      // At least one unit is unrecognised: only an exact match is safe.
      return existing.unit.trim().toLowerCase() === entry.unit.trim().toLowerCase();
    });

    if (bucket) bucket.push(entry);
    else buckets.push([entry]);
  }

  return buckets;
}

function sumBucket(
  bucket: readonly { quantity: number; unit: string }[],
): { quantity: number; unit: string } | null {
  const first = bucket[0];
  if (!first) return null;

  if (!isUnit(first.unit)) {
    // Unknown unit: every entry in this bucket shares it exactly, so a plain
    // sum is safe and no conversion is implied.
    return {
      quantity: round2(bucket.reduce((total, entry) => total + entry.quantity, 0)),
      unit: first.unit,
    };
  }

  const summed = addQuantities(
    bucket.map((entry) => ({ amount: entry.quantity, unit: entry.unit as Unit })),
  );
  if (!summed) return null;
  return { quantity: summed.amount, unit: summed.unit };
}

/**
 * Subtract what the pantry already holds.
 *
 * Returns `null` when the pantry covers the whole line, so it can be dropped.
 * When the units cannot be converted the pantry entry is ignored rather than
 * guessed at — under-buying because of a bad conversion means a meal that
 * cannot be cooked.
 */
function applyPantry(
  needed: { quantity: number; unit: string },
  pantry: PantryEntry | undefined,
): { quantity: number; unit: string; covered: number | null } | null {
  if (!pantry) return { ...needed, covered: null };
  if (pantry.alwaysInStock) return null;
  if (pantry.quantity === null || pantry.unit === null) return { ...needed, covered: null };

  if (!isUnit(needed.unit) || !isUnit(pantry.unit)) {
    if (needed.unit.trim().toLowerCase() !== pantry.unit.trim().toLowerCase()) {
      return { ...needed, covered: null };
    }
    const remaining = needed.quantity - pantry.quantity;
    if (remaining <= 0) return null;
    return { quantity: round2(remaining), unit: needed.unit, covered: pantry.quantity };
  }

  if (!areCompatible(needed.unit, pantry.unit)) return { ...needed, covered: null };

  const held = convert(pantry.quantity, pantry.unit, needed.unit);
  const remaining = needed.quantity - held;
  if (remaining <= 0) return null;

  return {
    quantity: round2(remaining),
    unit: needed.unit,
    covered: round2(held),
  };
}

export function buildShoppingList(
  items: readonly PlannedIngredient[],
  pantry: readonly PantryEntry[] = [],
  options: BuildShoppingListOptions = {},
): ShoppingListLine[] {
  const includeOptional = options.includeOptional ?? false;

  const relevant = items.filter((item) => includeOptional || !item.isOptional);
  const pantryById = new Map(pantry.map((entry) => [entry.ingredientId, entry]));

  const grouped = new Map<string, PlannedIngredient[]>();
  for (const item of relevant) {
    const existing = grouped.get(item.ingredientId);
    if (existing) existing.push(item);
    else grouped.set(item.ingredientId, [item]);
  }

  const lines: ShoppingListLine[] = [];

  for (const [ingredientId, entries] of grouped) {
    const first = entries[0];
    if (!first) continue;

    for (const bucket of bucketByCompatibility(entries)) {
      const summed = sumBucket(bucket);
      if (!summed || summed.quantity <= 0) continue;

      const afterPantry = applyPantry(summed, pantryById.get(ingredientId));
      if (!afterPantry) continue;

      lines.push({
        ingredientId,
        name: first.name,
        category: first.category,
        quantity: afterPantry.quantity,
        unit: afterPantry.unit,
        coveredByPantry: afterPantry.covered,
        fromOptionalOnly: bucket.every((entry) => entry.isOptional),
      });
    }
  }

  // Aisle order, then alphabetical inside an aisle — stable and shoppable.
  return lines.sort((a, b) => {
    const categoryDelta =
      CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
    if (categoryDelta !== 0) return categoryDelta;
    if (a.name !== b.name) return a.name.localeCompare(b.name);
    return a.unit.localeCompare(b.unit);
  });
}

export interface CategoryGroup {
  category: IngredientCategory;
  label: string;
  lines: ShoppingListLine[];
}

/** Group an ordered list into aisles, omitting empty ones. */
export function groupByCategory(lines: readonly ShoppingListLine[]): CategoryGroup[] {
  return CATEGORY_ORDER.map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    lines: lines.filter((line) => line.category === category),
  })).filter((group) => group.lines.length > 0);
}

export interface CompletionSummary {
  checked: number;
  total: number;
  /** "17 / 24" — the readout in CLAUDE.md §23. */
  label: string;
  isComplete: boolean;
}

export function completionSummary(
  items: readonly { isChecked: boolean }[],
): CompletionSummary {
  const checked = items.filter((item) => item.isChecked).length;
  return {
    checked,
    total: items.length,
    label: `${checked} / ${items.length}`,
    isComplete: items.length > 0 && checked === items.length,
  };
}

/**
 * Suggest whole retail packs for a required amount (CLAUDE.md §25).
 *
 * Deliberately simple: the smallest number of the largest sensible pack that
 * covers the requirement. Leftover is reported rather than optimised away —
 * using it up across meals is a phase-10 concern, and pretending to solve it
 * now would just produce a worse shopping list today.
 */
export function suggestPackaging(
  requiredQuantity: number,
  requiredUnit: string,
  packageSizes: readonly number[],
): { packSize: number; count: number; leftover: number } | null {
  const usable = packageSizes.filter((size) => size > 0).sort((a, b) => b - a);
  const largest = usable[0];
  if (largest === undefined || !isUnit(requiredUnit)) return null;

  const count = Math.ceil(requiredQuantity / largest);
  return {
    packSize: largest,
    count,
    leftover: round2(count * largest - requiredQuantity),
  };
}

/** Re-exported so callers do not need to reach into `utils/units` themselves. */
export type { Quantity };

const round2 = (value: number): number => Math.round(value * 100) / 100;
