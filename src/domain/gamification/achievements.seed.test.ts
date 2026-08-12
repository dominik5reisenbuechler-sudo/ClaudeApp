import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { ACHIEVEMENTS } from './achievements';

/**
 * The seed and the catalogue must agree.
 *
 * They are two halves of one definition: the app evaluates thresholds against
 * the TypeScript catalogue and stores only the id, while `user_achievements`
 * carries a foreign key into the seeded table. Drift breaks it in the quietest
 * possible way — an achievement that unlocks in the domain and then fails to
 * insert, or a seeded row nothing can ever earn.
 */

const SEED_PATH = 'supabase/seed/0004_achievements.sql';

interface SeedRow {
  id: string;
  name: string;
  category: string;
  metric: string;
  threshold: number;
  xpReward: number;
}

function readSeed(): SeedRow[] {
  const sql = readFileSync(SEED_PATH, 'utf8');
  const pattern =
    /\('([^']+)', '((?:[^']|'')+)', '(?:[^']|'')+', '[^']+', '([^']+)', '([^']+)', (\d+), (\d+), \d+\)/g;

  return [...sql.matchAll(pattern)].map((match) => ({
    id: match[1] as string,
    name: (match[2] as string).replace(/''/g, "'"),
    category: match[3] as string,
    metric: match[4] as string,
    threshold: Number(match[5]),
    xpReward: Number(match[6]),
  }));
}

describe('the achievements seed matches the catalogue', () => {
  const seeded = readSeed();

  it('seeds every achievement the catalogue defines', () => {
    expect(seeded.map((row) => row.id).sort()).toEqual(
      ACHIEVEMENTS.map((achievement) => achievement.id).sort(),
    );
  });

  it('agrees on every field the app relies on', () => {
    for (const achievement of ACHIEVEMENTS) {
      const row = seeded.find((candidate) => candidate.id === achievement.id);

      expect(row, `${achievement.id} is missing from the seed`).toBeDefined();
      expect(row).toMatchObject({
        name: achievement.name,
        category: achievement.category,
        metric: achievement.metric,
        threshold: achievement.threshold,
        xpReward: achievement.xpReward,
      });
    }
  });

  it('parsed something at all, so a broken regex cannot pass silently', () => {
    expect(seeded.length).toBeGreaterThan(20);
  });
});
