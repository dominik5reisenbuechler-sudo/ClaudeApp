import { describe, expect, it } from 'vitest';

import { planPackaging, KEEPS_WASTE_WEIGHT, PACK_PENALTY } from './packaging';

describe('planPackaging — combinations beat the largest pack', () => {
  it('splits the buy rather than throwing 300 g away', () => {
    // The case that motivated the whole module: 1 kg covers 700 g but wastes
    // 300 g, where 500 + 250 wastes 50 g.
    const plan = planPackaging(700, 'g', [250, 500, 1000], { category: 'meat_fish' });

    expect(plan?.packs).toEqual([
      { size: 500, count: 1 },
      { size: 250, count: 1 },
    ]);
    expect(plan?.leftover).toBe(50);
  });

  it('takes the single pack when it fits well', () => {
    const plan = planPackaging(950, 'g', [250, 500, 1000], { category: 'meat_fish' });

    expect(plan?.packs).toEqual([{ size: 1000, count: 1 }]);
    expect(plan?.leftover).toBe(50);
  });

  it('reports an exact fit as exact', () => {
    const plan = planPackaging(1000, 'g', [250, 500, 1000], { category: 'meat_fish' });

    expect(plan?.leftover).toBe(0);
    expect(plan?.totalPacks).toBe(1);
    expect(plan?.note).toMatch(/exactly what the plan needs/i);
  });

  it('will not buy a pile of small packs to save a few grams', () => {
    // 3 × 250 wastes the same 50 g as 500 + 250, but costs an extra pack.
    const plan = planPackaging(700, 'g', [250, 500, 1000], { category: 'meat_fish' });
    expect(plan?.totalPacks).toBe(2);
  });

  it('buys several packs when the requirement genuinely needs them', () => {
    const plan = planPackaging(2400, 'g', [500, 1000], { category: 'meat_fish' });

    expect(plan?.totalQuantity).toBeGreaterThanOrEqual(2400);
    expect(plan?.leftover).toBeLessThanOrEqual(100);
  });

  it('handles a single available pack size', () => {
    const plan = planPackaging(700, 'g', [500], { category: 'meat_fish' });

    expect(plan?.packs).toEqual([{ size: 500, count: 2 }]);
    expect(plan?.leftover).toBe(300);
  });
});

describe('planPackaging — leftover that keeps is not waste', () => {
  it('prefers the big bag for a shelf-stable ingredient', () => {
    // Rice: 300 g spare goes in the cupboard, so one bag beats two packs.
    const plan = planPackaging(700, 'g', [250, 500, 1000], { category: 'carbs' });

    expect(plan?.packs).toEqual([{ size: 1000, count: 1 }]);
    expect(plan?.leftoverKeeps).toBe(true);
    expect(plan?.note).toMatch(/cupboard/i);
  });

  it('splits the same requirement for something perishable', () => {
    const perishable = planPackaging(700, 'g', [250, 500, 1000], { category: 'vegetables' });

    expect(perishable?.totalPacks).toBe(2);
    expect(perishable?.leftoverKeeps).toBe(false);
    expect(perishable?.note).toMatch(/spare/i);
  });

  it('treats tins and spices as keeping', () => {
    for (const category of ['canned', 'spices', 'frozen'] as const) {
      expect(planPackaging(700, 'g', [250, 1000], { category })?.leftoverKeeps).toBe(true);
    }
  });

  it('treats meat, dairy, eggs, veg and fruit as perishable', () => {
    for (const category of ['meat_fish', 'dairy', 'eggs', 'vegetables', 'fruit'] as const) {
      expect(planPackaging(700, 'g', [250, 1000], { category })?.leftoverKeeps).toBe(false);
    }
  });

  it('assumes perishable when the category is unknown', () => {
    // The cautious default: advise against waste rather than for it.
    expect(planPackaging(700, 'g', [250, 500, 1000])?.totalPacks).toBe(2);
  });
});

describe('planPackaging — the awkward inputs', () => {
  it('returns null with no pack sizes', () => {
    expect(planPackaging(700, 'g', [])).toBeNull();
  });

  it('ignores nonsense pack sizes', () => {
    expect(planPackaging(700, 'g', [0, -100])).toBeNull();
    expect(planPackaging(700, 'g', [0, 500])?.packs).toEqual([{ size: 500, count: 2 }]);
  });

  it('returns null for a unit it cannot reason about', () => {
    expect(planPackaging(700, 'handfuls', [250, 500])).toBeNull();
  });

  it('returns null for a zero or negative requirement', () => {
    expect(planPackaging(0, 'g', [500])).toBeNull();
    expect(planPackaging(-5, 'g', [500])).toBeNull();
  });

  it('handles fractional pack sizes', () => {
    // 0.5 kg and 1 kg bags, needing 1.2 kg.
    const plan = planPackaging(1.2, 'kg', [0.5, 1], { category: 'carbs' });

    expect(plan?.totalQuantity).toBeGreaterThanOrEqual(1.2);
    expect(plan?.totalQuantity).toBeLessThanOrEqual(2);
  });

  it('handles count units like eggs', () => {
    const plan = planPackaging(14, 'piece', [6, 10, 12], { category: 'eggs' });

    expect(plan?.totalQuantity).toBeGreaterThanOrEqual(14);
    expect(plan?.leftover).toBeLessThanOrEqual(4);
  });

  it('deduplicates repeated pack sizes', () => {
    const plan = planPackaging(700, 'g', [500, 500, 250], { category: 'meat_fish' });
    expect(plan?.packs.filter((pack) => pack.size === 500)).toHaveLength(1);
  });

  it('still answers for a very large requirement', () => {
    // The search is abandoned past its cap and the greedy answer stands in,
    // rather than the caller getting nothing.
    const plan = planPackaging(500_000, 'g', [1000], { category: 'carbs' });

    expect(plan).not.toBeNull();
    expect(plan?.totalQuantity).toBeGreaterThanOrEqual(500_000);
  });
});

describe('planPackaging — the note explains the buy', () => {
  it('lists every pack', () => {
    const plan = planPackaging(700, 'g', [250, 500, 1000], { category: 'meat_fish' });
    expect(plan?.note).toContain('1 × 500 g');
    expect(plan?.note).toContain('1 × 250 g');
  });

  it('names the leftover', () => {
    const plan = planPackaging(700, 'g', [500], { category: 'meat_fish' });
    expect(plan?.note).toContain('300 g');
  });

  it('never leaves an undefined in the copy', () => {
    for (const required of [1, 99, 700, 2500]) {
      const plan = planPackaging(required, 'g', [250, 500, 1000], { category: 'dairy' });
      expect(plan?.note).not.toMatch(/undefined|NaN|Infinity/);
    }
  });
});

describe('the weights are stated, not hidden', () => {
  it('exposes what an extra pack has to be worth', () => {
    expect(PACK_PENALTY).toBe(0.1);
    expect(KEEPS_WASTE_WEIGHT).toBe(0.2);
  });
});
