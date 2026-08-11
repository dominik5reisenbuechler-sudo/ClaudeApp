import { describe, expect, it } from 'vitest';

import { remainingAgainst, totalsByMeal, totalsFor, EMPTY_TOTALS } from './dailyTotals';
import type { LoggedEntry } from './dailyTotals';

const entry = (over: Partial<LoggedEntry> = {}): LoggedEntry => ({
  mealType: 'breakfast',
  energyKcal: 300,
  proteinG: 25,
  carbsG: 30,
  fatG: 8,
  fiberG: 4,
  ...over,
});

describe('totalsFor', () => {
  it('returns zeros for an empty day', () => {
    expect(totalsFor([])).toEqual(EMPTY_TOTALS);
  });

  it('sums complete entries', () => {
    const totals = totalsFor([entry(), entry({ energyKcal: 500, proteinG: 40 })]);
    expect(totals.energyKcal).toBe(800);
    expect(totals.proteinG).toBe(65);
    expect(totals.entryCount).toBe(2);
    expect(totals.incompleteNutrients).toEqual([]);
  });

  it('skips unknown values instead of counting them as zero', () => {
    const totals = totalsFor([entry(), entry({ proteinG: null })]);
    // 25 g from the complete entry only — not 25 + 0 presented as a full total.
    expect(totals.proteinG).toBe(25);
    expect(totals.incompleteNutrients).toEqual(['proteinG']);
  });

  it('names every nutrient with a gap', () => {
    const totals = totalsFor([entry({ proteinG: null, fiberG: null })]);
    expect(totals.incompleteNutrients).toEqual(['proteinG', 'fiberG']);
  });

  it('orders incomplete nutrients canonically, not by insertion', () => {
    const totals = totalsFor([entry({ fiberG: null }), entry({ carbsG: null })]);
    expect(totals.incompleteNutrients).toEqual(['carbsG', 'fiberG']);
  });

  it('still totals energy when macros are missing, since energy is required', () => {
    const totals = totalsFor([
      entry({ proteinG: null, carbsG: null, fatG: null, fiberG: null, energyKcal: 420 }),
    ]);
    expect(totals.energyKcal).toBe(420);
    expect(totals.incompleteNutrients).toHaveLength(4);
  });

  it('rounds to one decimal place', () => {
    const totals = totalsFor([entry({ proteinG: 25.55 }), entry({ proteinG: 10.11 })]);
    expect(totals.proteinG).toBe(35.7);
  });
});

describe('totalsByMeal', () => {
  it('splits entries across meals', () => {
    const byMeal = totalsByMeal([
      entry({ mealType: 'breakfast', energyKcal: 400 }),
      entry({ mealType: 'dinner', energyKcal: 700 }),
      entry({ mealType: 'dinner', energyKcal: 100 }),
    ]);
    expect(byMeal.breakfast.energyKcal).toBe(400);
    expect(byMeal.dinner.energyKcal).toBe(800);
    expect(byMeal.lunch.energyKcal).toBe(0);
  });

  it('includes every meal so the UI can render empty slots', () => {
    const byMeal = totalsByMeal([]);
    expect(Object.keys(byMeal).sort()).toEqual(['breakfast', 'dinner', 'lunch', 'snack']);
  });

  it('tracks incompleteness per meal', () => {
    const byMeal = totalsByMeal([
      entry({ mealType: 'lunch', proteinG: null }),
      entry({ mealType: 'dinner' }),
    ]);
    expect(byMeal.lunch.incompleteNutrients).toEqual(['proteinG']);
    expect(byMeal.dinner.incompleteNutrients).toEqual([]);
  });
});

describe('remainingAgainst', () => {
  const targets = { energyKcal: 2650, proteinG: 175, carbsG: 300, fatG: 80, fiberG: 35 };

  it('reports what is left', () => {
    const remaining = remainingAgainst(
      { energyKcal: 1820, proteinG: 142, carbsG: 200, fatG: 50, fiberG: 20 },
      targets,
    );
    expect(remaining.energyKcal).toBe(830);
    expect(remaining.proteinG).toBe(33);
    expect(remaining.overBy.energyKcal).toBe(false);
  });

  it('goes negative rather than clamping, so an overshoot stays visible', () => {
    const remaining = remainingAgainst(
      { energyKcal: 2950, proteinG: 180, carbsG: 320, fatG: 95, fiberG: 40 },
      targets,
    );
    expect(remaining.energyKcal).toBe(-300);
    expect(remaining.overBy.energyKcal).toBe(true);
    expect(remaining.overBy.proteinG).toBe(true);
  });

  it('is exact at the target', () => {
    const remaining = remainingAgainst({ ...targets }, targets);
    expect(remaining.energyKcal).toBe(0);
    expect(remaining.overBy.energyKcal).toBe(false);
  });
});
