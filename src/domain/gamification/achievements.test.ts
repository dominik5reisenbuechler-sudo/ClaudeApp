import { describe, expect, it } from 'vitest';

import {
  achievementStatuses,
  detectUnlocks,
  ACHIEVEMENTS,
  ACHIEVEMENTS_BY_ID,
  EMPTY_PROGRESS,
} from './achievements';
import type { AchievementProgress } from './achievements';

const TODAY = '2025-06-22';

const progress = (over: Partial<AchievementProgress> = {}): AchievementProgress => ({
  ...EMPTY_PROGRESS,
  ...over,
});

describe('the catalogue itself', () => {
  it('has unique ids', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    expect(ACHIEVEMENTS_BY_ID.size).toBe(ACHIEVEMENTS.length);
  });

  it('thresholds only on metrics the app actually computes', () => {
    for (const achievement of ACHIEVEMENTS) {
      expect(EMPTY_PROGRESS).toHaveProperty(achievement.metric);
    }
  });

  it('never rewards a direction of travel on the scale', () => {
    // No achievement may unlock on weight lost, gained, or a body-fat figure.
    // Rewarding the number itself is the mechanic that makes tracking apps
    // harmful for the people most at risk from them.
    const text = ACHIEVEMENTS.map((a) => `${a.id} ${a.name} ${a.description}`).join(' ');

    expect(text).not.toMatch(/lost|lose|shed|slim|kilos? down|goal weight|body fat/i);
    for (const achievement of ACHIEVEMENTS) {
      expect(achievement.metric).not.toMatch(/weight_lost|body_fat|target_weight/);
    }
  });

  it('gives body-category achievements to measuring, not to results', () => {
    const body = ACHIEVEMENTS.filter((a) => a.category === 'body');

    expect(body.length).toBeGreaterThan(0);
    for (const achievement of body) {
      expect(achievement.metric).toBe('weigh_ins');
    }
  });

  it('gives every achievement a positive threshold and a description', () => {
    for (const achievement of ACHIEVEMENTS) {
      expect(achievement.threshold).toBeGreaterThan(0);
      expect(achievement.description.trim().length).toBeGreaterThan(10);
      expect(achievement.xpReward).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('detectUnlocks', () => {
  it('finds an achievement that has just become true', () => {
    const unlocks = detectUnlocks(progress({ workouts_completed: 1 }), new Set(), TODAY);

    expect(unlocks.map((u) => u.achievementId)).toContain('first_session');
    expect(unlocks[0]?.unlockedOn).toBe(TODAY);
  });

  it('does not re-award something already unlocked', () => {
    const unlocks = detectUnlocks(
      progress({ workouts_completed: 1 }),
      new Set(['first_session']),
      TODAY,
    );

    expect(unlocks.map((u) => u.achievementId)).not.toContain('first_session');
  });

  it('is idempotent — running it again after recording finds nothing new', () => {
    const current = progress({ workouts_completed: 12, personal_records: 3 });
    const first = detectUnlocks(current, new Set(), TODAY);
    const second = detectUnlocks(current, new Set(first.map((u) => u.achievementId)), TODAY);

    expect(first.length).toBeGreaterThan(0);
    expect(second).toEqual([]);
  });

  it('awards every tier crossed at once rather than one per run', () => {
    // Someone importing a training history should not have to open the app
    // fifty times to collect fifty achievements.
    const unlocks = detectUnlocks(progress({ workouts_completed: 100 }), new Set(), TODAY);
    const ids = unlocks.map((u) => u.achievementId);

    expect(ids).toContain('first_session');
    expect(ids).toContain('ten_sessions');
    expect(ids).toContain('fifty_sessions');
    expect(ids).toContain('hundred_sessions');
  });

  it('finds nothing at all for a brand-new account', () => {
    expect(detectUnlocks(EMPTY_PROGRESS, new Set(), TODAY)).toEqual([]);
  });

  it('unlocks exactly at the threshold, not one past it', () => {
    expect(
      detectUnlocks(progress({ weigh_ins: 30 }), new Set(), TODAY).map((u) => u.achievementId),
    ).toContain('thirty_weigh_ins');
    expect(
      detectUnlocks(progress({ weigh_ins: 29 }), new Set(), TODAY).map((u) => u.achievementId),
    ).not.toContain('thirty_weigh_ins');
  });

  it('carries the XP reward so the ledger can record it', () => {
    const unlock = detectUnlocks(progress({ workouts_completed: 1 }), new Set(), TODAY).find(
      (u) => u.achievementId === 'first_session',
    );

    expect(unlock?.xpReward).toBe(ACHIEVEMENTS_BY_ID.get('first_session')?.xpReward);
  });
});

describe('achievementStatuses', () => {
  it('shows locked achievements with their progress rather than hiding them', () => {
    const statuses = achievementStatuses(progress({ workouts_completed: 5 }), new Map());

    expect(statuses).toHaveLength(ACHIEVEMENTS.length);
    const ten = statuses.find((s) => s.definition.id === 'ten_sessions');
    expect(ten?.fraction).toBe(0.5);
    expect(ten?.unlockedOn).toBeNull();
  });

  it('caps the displayed value at the threshold', () => {
    const statuses = achievementStatuses(progress({ workouts_completed: 400 }), new Map());
    const first = statuses.find((s) => s.definition.id === 'first_session');

    expect(first?.value).toBe(1);
    expect(first?.fraction).toBe(1);
  });

  it('puts unlocked achievements first, most recent first', () => {
    const statuses = achievementStatuses(
      progress({ workouts_completed: 10 }),
      new Map([
        ['first_session', '2025-05-01'],
        ['ten_sessions', '2025-06-01'],
      ]),
    );

    expect(statuses[0]?.definition.id).toBe('ten_sessions');
    expect(statuses[1]?.definition.id).toBe('first_session');
  });

  it('orders the locked ones by how close they are', () => {
    const statuses = achievementStatuses(
      progress({ workouts_completed: 9, weigh_ins: 1 }),
      new Map(),
    );
    const locked = statuses.filter((s) => s.unlockedOn === null);

    for (let index = 1; index < locked.length; index += 1) {
      expect(locked[index - 1]?.fraction).toBeGreaterThanOrEqual(locked[index]?.fraction ?? 0);
    }
  });

  it('never reports progress outside 0–1', () => {
    const statuses = achievementStatuses(progress({ total_xp: 999_999 }), new Map());

    for (const status of statuses) {
      expect(status.fraction).toBeGreaterThanOrEqual(0);
      expect(status.fraction).toBeLessThanOrEqual(1);
    }
  });
});
