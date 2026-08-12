/**
 * Choosing which packs to buy (CLAUDE.md §25).
 *
 * The obvious answer — smallest number of the largest pack that covers the
 * requirement — is what phase 5 shipped, and it is wrong often enough to
 * matter. Needing 700 g with 250 g / 500 g / 1 kg packs available, it buys a
 * kilo and throws 300 g away, when 500 + 250 covers it with 50 g spare.
 *
 * So this searches combinations instead, scoring them on two things that pull
 * against each other:
 *
 *   - **Leftover**, relative to what was needed.
 *   - **Pack count**, because six small packs to save 20 g is more packaging,
 *     more to carry, and usually more money per unit.
 *
 * The interesting part is that leftover is not always waste. 300 g of spare
 * rice is stock; 300 g of spare chicken is a problem. Shelf stability comes
 * from the ingredient's category, and it changes which combination wins.
 */

import { isUnit } from '@/utils/units';
import type { IngredientCategory } from '@/types/domain';

export interface PackSelection {
  size: number;
  count: number;
}

export interface PackagingPlan {
  /** Largest pack first. */
  packs: PackSelection[];
  totalPacks: number;
  totalQuantity: number;
  leftover: number;
  unit: string;
  /** True when the leftover keeps, so it is stock rather than waste. */
  leftoverKeeps: boolean;
  /** What to buy and what it leaves over, in the user's terms. */
  note: string;
}

/**
 * Categories whose leftovers keep. Rice, tins and spices sit in the cupboard;
 * chicken and spinach do not.
 */
const KEEPS: ReadonlySet<IngredientCategory> = new Set<IngredientCategory>([
  'carbs',
  'canned',
  'spices',
  'frozen',
  'other',
]);

/**
 * How much relative leftover an extra pack is worth avoiding.
 *
 * At 0.1, a second pack has to save more than 10% of the required amount in
 * leftover before it is worth carrying home.
 */
export const PACK_PENALTY = 0.1;

/** Leftover of a shelf-stable ingredient counts for a fifth of perishable waste. */
export const KEEPS_WASTE_WEIGHT = 0.2;

/** Beyond this the search is abandoned for the greedy answer. */
const MAX_SEARCH_UNITS = 100_000;

/** Nobody is buying twenty packs of anything for one week's plan. */
const MAX_PACKS = 12;

export function planPackaging(
  requiredQuantity: number,
  requiredUnit: string,
  packageSizes: readonly number[],
  options: { category?: IngredientCategory } = {},
): PackagingPlan | null {
  const sizes = [...new Set(packageSizes.filter((size) => size > 0))].sort((a, b) => b - a);
  if (sizes.length === 0 || requiredQuantity <= 0 || !isUnit(requiredUnit)) return null;

  const keeps = options.category !== undefined && KEEPS.has(options.category);
  const wasteWeight = keeps ? KEEPS_WASTE_WEIGHT : 1;

  const combination =
    bestCombination(requiredQuantity, sizes, wasteWeight) ??
    greedyCombination(requiredQuantity, sizes);

  const totalQuantity = round2(
    combination.reduce((total, pack) => total + pack.size * pack.count, 0),
  );
  const totalPacks = combination.reduce((total, pack) => total + pack.count, 0);
  const leftover = round2(totalQuantity - requiredQuantity);

  return {
    packs: combination,
    totalPacks,
    totalQuantity,
    leftover,
    unit: requiredUnit,
    leftoverKeeps: keeps,
    note: buildNote({ combination, leftover, unit: requiredUnit, keeps }),
  };
}

/**
 * Exhaustive over quantities rather than over combinations.
 *
 * `reachable[q]` is the fewest packs that total exactly `q`, which is an
 * ordinary unbounded-knapsack fill. Every quantity from the requirement up to
 * one pack past it is then a candidate, and the best is whichever scores
 * lowest. Enumerating combinations directly would blow up with several pack
 * sizes; this stays linear in the quantity.
 */
function bestCombination(
  required: number,
  sizes: readonly number[],
  wasteWeight: number,
): PackSelection[] | null {
  const scale = scaleFactor([...sizes, required]);
  if (scale === null) return null;

  const scaledSizes = sizes.map((size) => Math.round(size * scale));
  const scaledRequired = Math.ceil(required * scale);
  const largest = Math.max(...scaledSizes);
  const cap = scaledRequired + largest;

  if (cap > MAX_SEARCH_UNITS) return null;

  // Fewest packs to reach exactly q, and the size used to get there.
  const packsTo = new Array<number>(cap + 1).fill(Number.POSITIVE_INFINITY);
  const via = new Array<number>(cap + 1).fill(-1);
  packsTo[0] = 0;

  for (let q = 1; q <= cap; q += 1) {
    for (const size of scaledSizes) {
      if (size > q) continue;
      const candidate = (packsTo[q - size] as number) + 1;
      if (candidate < (packsTo[q] as number)) {
        packsTo[q] = candidate;
        via[q] = size;
      }
    }
  }

  let bestQuantity = -1;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let q = scaledRequired; q <= cap; q += 1) {
    const packs = packsTo[q] as number;
    if (!Number.isFinite(packs) || packs > MAX_PACKS) continue;

    const score =
      ((q - scaledRequired) / scaledRequired) * wasteWeight + (packs - 1) * PACK_PENALTY;

    if (score < bestScore) {
      bestScore = score;
      bestQuantity = q;
    }
  }

  if (bestQuantity < 0) return null;

  const counts = new Map<number, number>();
  for (let q = bestQuantity; q > 0; q -= via[q] as number) {
    const size = via[q] as number;
    if (size <= 0) return null;
    counts.set(size, (counts.get(size) ?? 0) + 1);
  }

  return [...counts]
    .map(([size, count]) => ({ size: round2(size / scale), count }))
    .sort((a, b) => b.size - a.size);
}

/** The phase-5 answer, kept as the fallback when the search is not worth running. */
function greedyCombination(required: number, sizes: readonly number[]): PackSelection[] {
  const largest = sizes[0] as number;
  return [{ size: largest, count: Math.ceil(required / largest) }];
}

/**
 * A multiplier that makes every value a whole number, or null when no small
 * one does. Pack sizes are things like 250, 0.5 or 12 — two decimal places is
 * more than the real world uses.
 */
function scaleFactor(values: readonly number[]): number | null {
  for (const factor of [1, 10, 100]) {
    if (values.every((value) => Math.abs(value * factor - Math.round(value * factor)) < 1e-9)) {
      return factor;
    }
  }
  return null;
}

function buildNote(input: {
  combination: readonly PackSelection[];
  leftover: number;
  unit: string;
  keeps: boolean;
}): string {
  const packs = input.combination
    .map((pack) => `${pack.count} × ${formatNumber(pack.size)} ${input.unit}`)
    .join(' + ');

  if (input.leftover <= 0.001) return `Buy ${packs} — exactly what the plan needs.`;

  const leftover = `${formatNumber(input.leftover)} ${input.unit}`;
  return input.keeps
    ? `Buy ${packs}. ${leftover} left for the cupboard.`
    : `Buy ${packs}, leaving ${leftover} spare — worth planning something else around.`;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? `${value}` : `${round2(value)}`;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;
