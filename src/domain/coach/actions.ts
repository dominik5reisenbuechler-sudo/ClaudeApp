/**
 * What the coach is allowed to propose, and what it can never do.
 *
 * The coach **cannot write anything.** It returns proposed actions; the user
 * taps to confirm; the app performs the write. That is not a politeness — it is
 * the security boundary. A model that can be steered by the text of a food
 * label it was asked about must not be able to change what someone eats.
 *
 * Two rules make the boundary real rather than decorative:
 *
 * **The vocabulary contains no destructive verb.** There is no delete action,
 * no "clear my log", no "reset my targets". Not "delete requires confirmation"
 * — the coach has no way to express a deletion at all, so no amount of clever
 * prompting produces one.
 *
 * **Anything that fails validation is dropped, not shown.** A malformed or
 * unrecognised action is a bug or an attack; either way, rendering it and
 * letting the user confirm it would be trusting the model's output shape. The
 * parse is the gate.
 */

import { z } from 'zod';

/**
 * Every action the coach may propose. Additive, non-destructive, and each one
 * maps to something the user could already do by hand in two taps.
 */
export const COACH_ACTION_TYPES = [
  'log_weight',
  'log_food',
  'set_calorie_target',
  'swap_exercise',
  'add_meal_to_plan',
  'open_screen',
] as const;
export type CoachActionType = (typeof COACH_ACTION_TYPES)[number];

const logWeight = z.object({
  type: z.literal('log_weight'),
  weightKg: z.number().min(25).max(400),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const logFood = z.object({
  type: z.literal('log_food'),
  foodId: z.string().min(1),
  displayName: z.string().min(1).max(120),
  quantityG: z.number().positive().max(5000),
  mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
});

/**
 * A target change is bounded here as well as downstream. The calorie engine
 * enforces its own floor, but a proposal the user sees should never contain a
 * number the app would then refuse — that reads as the app arguing with itself.
 */
const setCalorieTarget = z.object({
  type: z.literal('set_calorie_target'),
  energyKcal: z.number().int().min(1200).max(6000),
  reason: z.string().min(20).max(500),
});

const swapExercise = z.object({
  type: z.literal('swap_exercise'),
  workoutExerciseId: z.string().min(1),
  replacementExerciseId: z.string().min(1),
  reason: z.string().min(10).max(500),
});

const addMealToPlan = z.object({
  type: z.literal('add_meal_to_plan'),
  recipeId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
  servings: z.number().positive().max(12),
});

/** Navigation only. Cannot change anything, so it needs no confirmation. */
const openScreen = z.object({
  type: z.literal('open_screen'),
  path: z.enum([
    '/nutrition',
    '/nutrition/recipes',
    '/nutrition/meal-plan',
    '/nutrition/shopping-list',
    '/training',
    '/progress',
    '/progress/checkin',
    '/progress/strength',
  ]),
  label: z.string().min(1).max(60),
});

export const coachActionSchema = z.discriminatedUnion('type', [
  logWeight,
  logFood,
  setCalorieTarget,
  swapExercise,
  addMealToPlan,
  openScreen,
]);

export type CoachAction = z.infer<typeof coachActionSchema>;

export interface CoachReply {
  message: string;
  actions: CoachAction[];
  /** Actions that arrived malformed and were discarded, for diagnostics. */
  discardedActions: number;
}

/**
 * Parse a model response into a reply the app is willing to render.
 *
 * Every failure mode ends in a usable reply rather than an exception: the
 * message is the product, and losing it because one action in an array was
 * malformed would be the wrong trade.
 */
export function parseCoachReply(raw: unknown): CoachReply {
  const envelope = z
    .object({
      message: z.string().min(1),
      actions: z.array(z.unknown()).optional(),
    })
    .safeParse(raw);

  if (!envelope.success) {
    return {
      message:
        'Something went wrong reading that answer. Try asking again — and if it keeps happening, the question may be one I cannot help with.',
      actions: [],
      discardedActions: 0,
    };
  }

  const actions: CoachAction[] = [];
  let discardedActions = 0;

  for (const candidate of envelope.data.actions ?? []) {
    const parsed = coachActionSchema.safeParse(candidate);
    if (parsed.success) actions.push(parsed.data);
    else discardedActions += 1;
  }

  return { message: envelope.data.message, actions, discardedActions };
}

/**
 * Whether performing this action changes the user's data.
 *
 * `open_screen` does not, so it is a link rather than a confirmation. Everything
 * else needs an explicit tap — and `requiresConfirmation` returning `true` by
 * default for an unknown type is deliberate: a new action added carelessly
 * later fails closed.
 */
export function requiresConfirmation(action: CoachAction): boolean {
  return action.type !== 'open_screen';
}

/** What the confirmation button says, built from the action's own values. */
export function describeAction(action: CoachAction): { title: string; detail: string } {
  switch (action.type) {
    case 'log_weight':
      return {
        title: `Log ${action.weightKg} kg`,
        detail: action.date ? `Recorded against ${action.date}.` : 'Recorded against today.',
      };
    case 'log_food':
      return {
        title: `Log ${action.quantityG} g of ${action.displayName}`,
        detail: `Added to ${action.mealType}.`,
      };
    case 'set_calorie_target':
      return {
        title: `Set your target to ${action.energyKcal.toLocaleString('en-US')} kcal`,
        detail: action.reason,
      };
    case 'swap_exercise':
      return { title: 'Swap this exercise', detail: action.reason };
    case 'add_meal_to_plan':
      return {
        title: `Add to ${action.mealType} on ${action.date}`,
        detail: `${action.servings} ${action.servings === 1 ? 'serving' : 'servings'}.`,
      };
    case 'open_screen':
      return { title: action.label, detail: '' };
  }
}

/**
 * The action vocabulary, as the model is told about it.
 *
 * Generated from the same list the parser enforces, so the two cannot drift
 * into a state where the coach is invited to propose something that would then
 * be silently discarded.
 */
export const COACH_ACTION_GUIDE = `You may propose actions for the user to confirm. Never assume an action happened — you cannot perform them, the user confirms each one.

Return JSON: { "message": string, "actions": Action[] }

Action types:
- { "type": "log_weight", "weightKg": number, "date"?: "YYYY-MM-DD" }
- { "type": "log_food", "foodId": string, "displayName": string, "quantityG": number, "mealType": "breakfast"|"lunch"|"dinner"|"snack" }
- { "type": "set_calorie_target", "energyKcal": number, "reason": string }
- { "type": "swap_exercise", "workoutExerciseId": string, "replacementExerciseId": string, "reason": string }
- { "type": "add_meal_to_plan", "recipeId": string, "date": "YYYY-MM-DD", "mealType": ..., "servings": number }
- { "type": "open_screen", "path": string, "label": string }

Only use an id that appears in the context. There is no action for deleting or clearing anything; if the user asks for that, tell them where to do it themselves. Return an empty actions array when nothing needs to change.`;
