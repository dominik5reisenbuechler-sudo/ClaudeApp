-- 0011 — the perfect-day bonus.
--
-- A day that hits all four daily habits — calories on target, protein met,
-- step goal reached, weighed in — earns a bonus on top of the four awards.
--
-- Training is deliberately not one of the four. A rest day is part of a
-- programme rather than a failure of one, and a bonus obtainable only by
-- training every day would pay people to skip their own deload. This is the
-- same reasoning that makes the training streak excuse scheduled rest days.
--
-- The value is carried in code (`XP_AWARDS` in src/domain/gamification/xp.ts);
-- only the vocabulary lives here. Uniqueness on
-- (user_id, kind, earned_on, dedupe_key) already makes the award idempotent, so
-- the bonus needs no table of its own.

alter type public.xp_kind add value if not exists 'perfect_day';
