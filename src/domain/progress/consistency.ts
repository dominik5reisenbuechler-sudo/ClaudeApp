/**
 * Training and logging consistency.
 *
 * Consistency is measured against what the user *planned*, not against an
 * arbitrary ideal. Someone who trains three times a week and planned three is
 * at 100%, not at 60% of somebody else's five. Judging a plan by another plan's
 * standard is how an app makes a consistent user feel like a failing one.
 *
 * These are plain adherence percentages — streaks, with their rest-day rules,
 * belong to phase 9.
 */

import { addDays, daysBetween } from '@/utils/date';
import type { IsoDate } from '@/types/domain';

export interface SessionRecord {
  date: IsoDate;
  completed: boolean;
}

export interface ConsistencySummary {
  /** Weeks covered by the window. */
  weeks: number;
  sessionsCompleted: number;
  sessionsPlanned: number;
  /** 0–100, capped: training more than planned is not over-100% adherence. */
  adherencePercent: number;
  /** Sessions per week actually completed. */
  averagePerWeek: number;
  /** Weeks in which at least one session was completed. */
  activeWeeks: number;
}

/**
 * Adherence over the window ending on `endDate`.
 *
 * Capped at 100 because the number answers "did you do what you planned?" —
 * an extra session is a bonus, not evidence of 125% adherence.
 */
export function summarizeConsistency(
  sessions: readonly SessionRecord[],
  plannedPerWeek: number,
  endDate: IsoDate,
  windowDays = 28,
): ConsistencySummary {
  const start = addDays(endDate, -(windowDays - 1));

  const inWindow = sessions.filter(
    (session) => session.completed && session.date >= start && session.date <= endDate,
  );

  const weeks = windowDays / 7;
  const sessionsPlanned = Math.round(plannedPerWeek * weeks);
  const sessionsCompleted = inWindow.length;

  const activeWeeks = new Set(
    inWindow.map((session) => Math.floor(daysBetween(start, session.date) / 7)),
  ).size;

  return {
    weeks,
    sessionsCompleted,
    sessionsPlanned,
    adherencePercent:
      sessionsPlanned > 0
        ? Math.min(100, Math.round((sessionsCompleted / sessionsPlanned) * 100))
        : 0,
    averagePerWeek: round1(sessionsCompleted / weeks),
    activeWeeks,
  };
}

export interface LoggingConsistency {
  daysLogged: number;
  totalDays: number;
  percent: number;
}

/**
 * How many days in the window have at least one entry.
 *
 * Feeds the adaptive engine's confidence score: an expenditure estimate built
 * on four logged days out of twenty-one is not one to act on.
 */
export function summarizeLoggingConsistency(
  loggedDates: readonly IsoDate[],
  endDate: IsoDate,
  windowDays = 21,
): LoggingConsistency {
  const start = addDays(endDate, -(windowDays - 1));
  const unique = new Set(
    loggedDates.filter((date) => date >= start && date <= endDate),
  );

  return {
    daysLogged: unique.size,
    totalDays: windowDays,
    percent: Math.round((unique.size / windowDays) * 100),
  };
}

/** Completed sessions per week, oldest week first — the consistency chart. */
export function sessionsPerWeek(
  sessions: readonly SessionRecord[],
  endDate: IsoDate,
  weeks = 8,
): { weekStart: IsoDate; sessions: number }[] {
  const result: { weekStart: IsoDate; sessions: number }[] = [];

  for (let index = weeks - 1; index >= 0; index -= 1) {
    const weekEnd = addDays(endDate, -index * 7);
    const weekStart = addDays(weekEnd, -6);
    const count = sessions.filter(
      (session) => session.completed && session.date >= weekStart && session.date <= weekEnd,
    ).length;
    result.push({ weekStart, sessions: count });
  }

  return result;
}

const round1 = (value: number): number => Math.round(value * 10) / 10;
