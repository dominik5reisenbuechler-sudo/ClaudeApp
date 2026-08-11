/**
 * Calendar-date helpers.
 *
 * A "day" in this product is a human day in the user's own reckoning — the day
 * they ate the food, the day they weighed in. Converting that through UTC
 * introduces off-by-one errors either side of midnight, so days are handled as
 * `YYYY-MM-DD` strings and only converted to `Date` at UTC noon, which is far
 * enough from either boundary that no timezone shift can move the date.
 */

import type { IsoDate, IsoWeekday } from '@/types/domain';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): value is IsoDate {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  // Rejects `2025-02-30`, which `Date` would silently roll over to March.
  return toIsoDate(parsed) === value;
}

/** Format a `Date` as `YYYY-MM-DD` using its UTC fields. */
export function toIsoDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

/** Parse `YYYY-MM-DD` to a `Date` anchored at UTC noon. */
export function fromIsoDate(date: IsoDate): Date {
  if (!ISO_DATE_PATTERN.test(date)) {
    throw new Error(`fromIsoDate: expected YYYY-MM-DD, received "${date}"`);
  }
  return new Date(`${date}T12:00:00.000Z`);
}

/** Today in the device's local calendar, as `YYYY-MM-DD`. */
export function todayIsoDate(now: Date = new Date()): IsoDate {
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = fromIsoDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return toIsoDate(d);
}

/** Whole days from `from` to `to`. Negative when `to` precedes `from`. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  const ms = fromIsoDate(to).getTime() - fromIsoDate(from).getTime();
  return Math.round(ms / 86_400_000);
}

/** ISO weekday, 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: IsoDate): IsoWeekday {
  const day = fromIsoDate(date).getUTCDay();
  return (day === 0 ? 7 : day) as IsoWeekday;
}

/** The Monday on or before `date`. */
export function startOfIsoWeek(date: IsoDate): IsoDate {
  return addDays(date, -(isoWeekday(date) - 1));
}

/**
 * Age in whole years on `on`. Derived rather than stored, because a stored age
 * is wrong within a year of being written (DATABASE_SCHEMA.md).
 */
export function ageOn(birthDate: IsoDate, on: IsoDate): number {
  const birth = fromIsoDate(birthDate);
  const reference = fromIsoDate(on);
  let age = reference.getUTCFullYear() - birth.getUTCFullYear();
  const monthDelta = reference.getUTCMonth() - birth.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && reference.getUTCDate() < birth.getUTCDate())) {
    age -= 1;
  }
  return age;
}

/** Inclusive list of dates from `from` to `to`. */
export function dateRange(from: IsoDate, to: IsoDate): IsoDate[] {
  const length = daysBetween(from, to);
  if (length < 0) return [];
  const dates: IsoDate[] = [];
  for (let i = 0; i <= length; i += 1) dates.push(addDays(from, i));
  return dates;
}
