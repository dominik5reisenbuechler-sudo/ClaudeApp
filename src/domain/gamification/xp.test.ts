import { describe, expect, it } from 'vitest';

import {
  levelProgress,
  totalXp,
  xpByKind,
  xpForDay,
  xpForLevel,
  CALORIE_BAND_PERCENT,
  PERFECT_DAY_KINDS,
  XP_AWARDS,
  XP_LEVEL_STEP,
} from './xp';
import type { DayForXp, XpEvent } from './xp';

const TARGETS = { energyKcal: 2800, proteinG: 170, stepGoal: 9000 };

function day(over: Partial<DayForXp> = {}): DayForXp {
  return {
    date: '2025-06-22',
    energyKcal: 2800,
    proteinG: 175,
    steps: 9500,
    weightLogged: true,
    workoutsCompleted: 1,
    targets: TARGETS,
    ...over,
  };
}

const kinds = (events: readonly XpEvent[]): string[] => events.map((event) => event.kind).sort();

describe('xpForDay', () => {
  it('awards everything on a day that did everything', () => {
    expect(kinds(xpForDay(day()))).toEqual([
      'calorie_target',
      'perfect_day',
      'protein_target',
      'step_goal',
      'weight_logged',
      'workout_completed',
    ]);
  });

  it('awards nothing on an empty day', () => {
    const events = xpForDay(
      day({ energyKcal: null, proteinG: null, steps: null, weightLogged: false, workoutsCompleted: 0 }),
    );
    expect(events).toEqual([]);
  });

  it('pays once for a day with two sessions', () => {
    const events = xpForDay(day({ workoutsCompleted: 2 }));
    const workout = events.filter((event) => event.kind === 'workout_completed');

    expect(workout).toHaveLength(1);
    expect(workout[0]?.xp).toBe(XP_AWARDS.workout_completed);
    // The count is still recorded, so the reason is honest.
    expect(workout[0]?.context).toEqual({ sessions: 2 });
  });

  it('is idempotent — the same day always produces the same events', () => {
    expect(xpForDay(day())).toEqual(xpForDay(day()));
  });
});

describe('xpForDay — the perfect-day bonus', () => {
  const hasBonus = (over: Partial<DayForXp> = {}): boolean =>
    xpForDay(day(over)).some((event) => event.kind === 'perfect_day');

  it('pays a bonus when all four daily habits landed', () => {
    const bonus = xpForDay(day()).find((event) => event.kind === 'perfect_day');

    expect(bonus?.xp).toBe(XP_AWARDS.perfect_day);
    expect(bonus?.earnedOn).toBe('2025-06-22');
    expect(bonus?.context).toEqual({ kinds: [...PERFECT_DAY_KINDS] });
  });

  it('does not require a workout — a rest day can still be perfect', () => {
    expect(hasBonus({ workoutsCompleted: 0 })).toBe(true);
  });

  it.each(PERFECT_DAY_KINDS)('withholds the bonus when %s is missing', (missing) => {
    const breaks: Record<(typeof PERFECT_DAY_KINDS)[number], Partial<DayForXp>> = {
      calorie_target: { energyKcal: 2000 },
      protein_target: { proteinG: 80 },
      step_goal: { steps: 1200 },
      weight_logged: { weightLogged: false },
    };

    expect(hasBonus(breaks[missing])).toBe(false);
  });

  it('withholds the bonus on a day too partial to qualify at all', () => {
    // Under-logged food takes calories and protein with it, so the bonus goes
    // too — it can never be earned on a day the nutrition awards were refused.
    expect(hasBonus({ energyKcal: 600, proteinG: 200 })).toBe(false);
  });

  it('pays the bonus at most once', () => {
    const bonuses = xpForDay(day()).filter((event) => event.kind === 'perfect_day');
    expect(bonuses).toHaveLength(1);
  });

  it('is worth less than a workout, so it cannot become the point of the day', () => {
    expect(XP_AWARDS.perfect_day).toBeLessThan(XP_AWARDS.workout_completed);
  });
});

describe('xpForDay — calories are a band, not a number', () => {
  it('accepts a day inside the band', () => {
    const within = TARGETS.energyKcal * (1 + (CALORIE_BAND_PERCENT - 1) / 100);
    const events = xpForDay(day({ energyKcal: Math.round(within) }));
    expect(kinds(events)).toContain('calorie_target');
  });

  it('rejects a day outside the band', () => {
    const events = xpForDay(day({ energyKcal: 3400 }));
    expect(kinds(events)).not.toContain('calorie_target');
  });

  it('is symmetric — under counts as much as over', () => {
    const over = xpForDay(day({ energyKcal: 3400 }));
    const under = xpForDay(day({ energyKcal: 2200 }));

    expect(kinds(over)).not.toContain('calorie_target');
    expect(kinds(under)).not.toContain('calorie_target');
  });
});

describe('xpForDay — protein is a floor, not a band', () => {
  it('rewards going well over the target', () => {
    expect(kinds(xpForDay(day({ proteinG: 260 })))).toContain('protein_target');
  });

  it('allows a small shortfall', () => {
    // 95% of 170 is 161.5.
    expect(kinds(xpForDay(day({ proteinG: 165 })))).toContain('protein_target');
  });

  it('does not reward a real shortfall', () => {
    expect(kinds(xpForDay(day({ proteinG: 120 })))).not.toContain('protein_target');
  });
});

describe('xpForDay — a partial log cannot qualify', () => {
  it('withholds nutrition awards from a day that was barely logged', () => {
    // 900 kcal against a 2,800 target is a forgotten dinner, not a deficit —
    // and a protein figure from a partial day is meaningless too.
    const events = kinds(xpForDay(day({ energyKcal: 900, proteinG: 180 })));

    expect(events).not.toContain('calorie_target');
    expect(events).not.toContain('protein_target');
  });

  it('still pays for the things that do not depend on food logging', () => {
    const events = kinds(xpForDay(day({ energyKcal: 900, proteinG: 180 })));

    expect(events).toContain('workout_completed');
    expect(events).toContain('weight_logged');
    expect(events).toContain('step_goal');
  });
});

describe('xpForDay — steps', () => {
  it('awards at exactly the goal', () => {
    expect(kinds(xpForDay(day({ steps: 9000 })))).toContain('step_goal');
  });

  it('does not award below it', () => {
    expect(kinds(xpForDay(day({ steps: 8999 })))).not.toContain('step_goal');
  });

  it('treats missing step data as missing, not zero', () => {
    expect(kinds(xpForDay(day({ steps: null })))).not.toContain('step_goal');
  });
});

describe('totalXp', () => {
  const events: XpEvent[] = [
    { kind: 'workout_completed', xp: 100, earnedOn: '2025-06-20', context: {} },
    { kind: 'workout_completed', xp: 100, earnedOn: '2025-06-22', context: {} },
    { kind: 'weight_logged', xp: 10, earnedOn: '2025-06-22', context: {} },
    { kind: 'achievement', xp: 500, earnedOn: '2025-06-22', context: {} },
  ];

  it('sums the ledger', () => {
    expect(totalXp(events)).toBe(710);
  });

  it('is zero for an empty ledger rather than undefined', () => {
    expect(totalXp([])).toBe(0);
  });

  it('breaks the total down by kind', () => {
    expect(xpByKind(events)).toEqual({
      workout_completed: 200,
      weight_logged: 10,
      achievement: 500,
    });
  });

  it('carries achievement rewards through the same ledger', () => {
    // There is no second counter to drift from this one.
    expect(xpByKind(events).achievement).toBe(500);
  });
});

describe('levels', () => {
  it('starts everyone at level 1 with nothing earned', () => {
    expect(levelProgress(0)).toMatchObject({ level: 1, xpIntoLevel: 0 });
  });

  it('reaches level 2 at the first step', () => {
    expect(levelProgress(XP_LEVEL_STEP).level).toBe(2);
    expect(levelProgress(XP_LEVEL_STEP - 1).level).toBe(1);
  });

  it('grows the cost of each level', () => {
    const second = xpForLevel(3) - xpForLevel(2);
    const tenth = xpForLevel(11) - xpForLevel(10);
    expect(tenth).toBeGreaterThan(second);
  });

  it('keeps early levels reachable in days', () => {
    // A good week is roughly 1,500 XP, which should be worth several levels
    // early on — the number has to move when a new user is watching it.
    expect(levelProgress(1500).level).toBeGreaterThanOrEqual(3);
  });

  it('does not make later levels unreachable', () => {
    // Level 20 at about a year of consistent logging.
    expect(xpForLevel(20)).toBeLessThan(60_000);
  });

  it('reports progress through the current level', () => {
    const progress = levelProgress(xpForLevel(5) + 100);

    expect(progress.level).toBe(5);
    expect(progress.xpIntoLevel).toBe(100);
    expect(progress.fraction).toBeCloseTo(100 / progress.xpForNextLevel, 5);
  });

  it('handles a negative total without producing a negative level', () => {
    expect(levelProgress(-50)).toMatchObject({ level: 1, xpIntoLevel: 0 });
  });
});
