import { describe, expect, it } from 'vitest';

import {
  coachActionSchema,
  describeAction,
  parseCoachReply,
  requiresConfirmation,
  COACH_ACTION_GUIDE,
  COACH_ACTION_TYPES,
} from './actions';
import type { CoachAction } from './actions';

describe('the vocabulary has no destructive verb', () => {
  it('offers nothing that deletes, clears or resets', () => {
    for (const type of COACH_ACTION_TYPES) {
      expect(type).not.toMatch(/delete|remove|clear|reset|wipe|drop/i);
    }
  });

  it('rejects a delete however it is spelled', () => {
    const attempts = [
      { type: 'delete_food_entry', entryId: 'abc' },
      { type: 'clear_log', date: '2025-06-20' },
      { type: 'delete_account' },
      { type: 'log_food', foodId: 'x', displayName: 'y', quantityG: 100, mealType: 'lunch', andAlsoDelete: true },
    ];

    for (const attempt of attempts) {
      const reply = parseCoachReply({ message: 'ok', actions: [attempt] });
      expect(reply.actions.some((action) => 'andAlsoDelete' in action)).toBe(false);
    }

    // The three genuinely unknown types are discarded outright.
    expect(parseCoachReply({ message: 'ok', actions: attempts.slice(0, 3) }).actions).toEqual([]);
  });

  it('describes to the model exactly the types the parser accepts', () => {
    for (const type of COACH_ACTION_TYPES) {
      expect(COACH_ACTION_GUIDE).toContain(`"${type}"`);
    }
    // …and tells it there is no deletion, so it explains rather than inventing.
    expect(COACH_ACTION_GUIDE).toMatch(/no action for deleting/i);
  });
});

describe('parseCoachReply — the parse is the gate', () => {
  it('keeps a well-formed action', () => {
    const reply = parseCoachReply({
      message: 'You are 400 kcal under today.',
      actions: [{ type: 'log_weight', weightKg: 82.4 }],
    });

    expect(reply.actions).toEqual([{ type: 'log_weight', weightKg: 82.4 }]);
    expect(reply.discardedActions).toBe(0);
  });

  it('drops a malformed action but keeps the message', () => {
    const reply = parseCoachReply({
      message: 'Here is what I would do.',
      actions: [{ type: 'log_weight', weightKg: 'quite heavy' }],
    });

    expect(reply.message).toBe('Here is what I would do.');
    expect(reply.actions).toEqual([]);
    expect(reply.discardedActions).toBe(1);
  });

  it('keeps the good actions when one in the array is bad', () => {
    const reply = parseCoachReply({
      message: 'Two things.',
      actions: [
        { type: 'log_weight', weightKg: 82.4 },
        { type: 'log_weight', weightKg: -5 },
      ],
    });

    expect(reply.actions).toHaveLength(1);
    expect(reply.discardedActions).toBe(1);
  });

  it('handles a reply with no actions at all', () => {
    const reply = parseCoachReply({ message: 'Nothing needs to change.' });
    expect(reply.actions).toEqual([]);
  });

  it('never throws on rubbish', () => {
    for (const rubbish of [null, undefined, 42, 'a string', [], { actions: [] }, {}]) {
      expect(() => parseCoachReply(rubbish)).not.toThrow();
      expect(parseCoachReply(rubbish).actions).toEqual([]);
    }
  });

  it('returns a usable message rather than an empty one when parsing fails', () => {
    const reply = parseCoachReply({ notAMessage: true });
    expect(reply.message.length).toBeGreaterThan(20);
  });
});

describe('bounds on the values, not just the shapes', () => {
  it('refuses an impossible bodyweight', () => {
    expect(coachActionSchema.safeParse({ type: 'log_weight', weightKg: 5 }).success).toBe(false);
    expect(coachActionSchema.safeParse({ type: 'log_weight', weightKg: 900 }).success).toBe(false);
  });

  it('refuses a dangerous calorie target', () => {
    const low = coachActionSchema.safeParse({
      type: 'set_calorie_target',
      energyKcal: 700,
      reason: 'You said you want to lose weight quickly, so eat much less.',
    });
    expect(low.success).toBe(false);
  });

  it('refuses a calorie target with no explanation', () => {
    const unexplained = coachActionSchema.safeParse({
      type: 'set_calorie_target',
      energyKcal: 2400,
      reason: 'because',
    });
    expect(unexplained.success).toBe(false);
  });

  it('refuses an implausible food quantity', () => {
    const absurd = coachActionSchema.safeParse({
      type: 'log_food',
      foodId: 'x',
      displayName: 'Rice',
      quantityG: 90_000,
      mealType: 'lunch',
    });
    expect(absurd.success).toBe(false);
  });

  it('only navigates to screens that exist', () => {
    expect(
      coachActionSchema.safeParse({ type: 'open_screen', path: '/progress', label: 'Progress' })
        .success,
    ).toBe(true);
    expect(
      coachActionSchema.safeParse({
        type: 'open_screen',
        path: 'https://example.com',
        label: 'Tap here',
      }).success,
    ).toBe(false);
  });

  it('rejects a date that is not a date', () => {
    expect(
      coachActionSchema.safeParse({ type: 'log_weight', weightKg: 82, date: 'yesterday' }).success,
    ).toBe(false);
  });
});

describe('requiresConfirmation', () => {
  it('requires a tap for anything that writes', () => {
    const writes: CoachAction[] = [
      { type: 'log_weight', weightKg: 82 },
      { type: 'log_food', foodId: 'x', displayName: 'Rice', quantityG: 100, mealType: 'lunch' },
      {
        type: 'set_calorie_target',
        energyKcal: 2400,
        reason: 'Your weight has been flat for three weeks at 2,600 kcal.',
      },
      { type: 'swap_exercise', workoutExerciseId: 'a', replacementExerciseId: 'b', reason: 'Shoulder discomfort.' },
      { type: 'add_meal_to_plan', recipeId: 'r', date: '2025-06-20', mealType: 'dinner', servings: 2 },
    ];

    for (const action of writes) expect(requiresConfirmation(action)).toBe(true);
  });

  it('does not for navigation, which changes nothing', () => {
    expect(requiresConfirmation({ type: 'open_screen', path: '/progress', label: 'Progress' })).toBe(
      false,
    );
  });
});

describe('describeAction', () => {
  it('builds the confirmation from the action’s own values', () => {
    const described = describeAction({ type: 'log_weight', weightKg: 82.4, date: '2025-06-20' });

    expect(described.title).toContain('82.4 kg');
    expect(described.detail).toContain('2025-06-20');
  });

  it('carries the reason through for a target change', () => {
    const reason = 'Your weight has been flat for three weeks at 2,600 kcal a day.';
    const described = describeAction({ type: 'set_calorie_target', energyKcal: 2400, reason });

    expect(described.title).toContain('2,400');
    expect(described.detail).toBe(reason);
  });

  it('covers every action type without leaving a gap', () => {
    const one: Record<CoachAction['type'], CoachAction> = {
      log_weight: { type: 'log_weight', weightKg: 82 },
      log_food: { type: 'log_food', foodId: 'x', displayName: 'Rice', quantityG: 100, mealType: 'lunch' },
      set_calorie_target: {
        type: 'set_calorie_target',
        energyKcal: 2400,
        reason: 'Your weight has been flat for three weeks at 2,600 kcal.',
      },
      swap_exercise: {
        type: 'swap_exercise',
        workoutExerciseId: 'a',
        replacementExerciseId: 'b',
        reason: 'Shoulder discomfort.',
      },
      add_meal_to_plan: {
        type: 'add_meal_to_plan',
        recipeId: 'r',
        date: '2025-06-20',
        mealType: 'dinner',
        servings: 2,
      },
      open_screen: { type: 'open_screen', path: '/progress', label: 'Progress' },
    };

    for (const action of Object.values(one)) {
      const described = describeAction(action);
      expect(described.title.length).toBeGreaterThan(0);
      expect(described.title).not.toMatch(/undefined|NaN/);
    }
  });
});
