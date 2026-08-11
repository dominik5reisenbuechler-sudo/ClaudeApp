import { describe, expect, it } from 'vitest';

import {
  addDays,
  ageOn,
  dateRange,
  daysBetween,
  fromIsoDate,
  isIsoDate,
  isoWeekday,
  startOfIsoWeek,
  todayIsoDate,
  toIsoDate,
} from './date';

describe('isIsoDate', () => {
  it('accepts well-formed dates', () => {
    expect(isIsoDate('2025-01-01')).toBe(true);
    expect(isIsoDate('2024-02-29')).toBe(true);
  });

  it('rejects malformed strings', () => {
    expect(isIsoDate('2025-1-1')).toBe(false);
    expect(isIsoDate('01/01/2025')).toBe(false);
    expect(isIsoDate('')).toBe(false);
  });

  it('rejects dates that do not exist rather than rolling them over', () => {
    expect(isIsoDate('2025-02-30')).toBe(false);
    expect(isIsoDate('2025-13-01')).toBe(false);
    expect(isIsoDate('2025-02-29')).toBe(false);
  });
});

describe('fromIsoDate / toIsoDate', () => {
  it('round-trips', () => {
    expect(toIsoDate(fromIsoDate('2025-06-15'))).toBe('2025-06-15');
  });

  it('anchors at UTC noon so no timezone shift changes the date', () => {
    expect(fromIsoDate('2025-06-15').getUTCHours()).toBe(12);
  });

  it('rejects a malformed input', () => {
    expect(() => fromIsoDate('15-06-2025')).toThrow();
  });
});

describe('todayIsoDate', () => {
  it('uses local calendar fields', () => {
    const now = new Date(2025, 5, 15, 23, 30);
    expect(todayIsoDate(now)).toBe('2025-06-15');
  });

  it('pads single-digit months and days', () => {
    expect(todayIsoDate(new Date(2025, 0, 5, 8, 0))).toBe('2025-01-05');
  });
});

describe('addDays', () => {
  it('adds and subtracts', () => {
    expect(addDays('2025-01-01', 1)).toBe('2025-01-02');
    expect(addDays('2025-01-01', -1)).toBe('2024-12-31');
  });

  it('crosses month and leap-year boundaries', () => {
    expect(addDays('2025-01-31', 1)).toBe('2025-02-01');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2025-02-28', 1)).toBe('2025-03-01');
  });
});

describe('daysBetween', () => {
  it('counts whole days in both directions', () => {
    expect(daysBetween('2025-01-01', '2025-01-08')).toBe(7);
    expect(daysBetween('2025-01-08', '2025-01-01')).toBe(-7);
    expect(daysBetween('2025-01-01', '2025-01-01')).toBe(0);
  });

  it('is unaffected by a DST transition', () => {
    // Europe/Berlin springs forward on 2025-03-30.
    expect(daysBetween('2025-03-29', '2025-03-31')).toBe(2);
  });
});

describe('isoWeekday and startOfIsoWeek', () => {
  it('maps Monday to 1 and Sunday to 7', () => {
    expect(isoWeekday('2025-06-16')).toBe(1);
    expect(isoWeekday('2025-06-22')).toBe(7);
  });

  it('finds the Monday on or before a date', () => {
    expect(startOfIsoWeek('2025-06-18')).toBe('2025-06-16');
    expect(startOfIsoWeek('2025-06-22')).toBe('2025-06-16');
    expect(startOfIsoWeek('2025-06-16')).toBe('2025-06-16');
  });
});

describe('ageOn', () => {
  it('counts whole years', () => {
    expect(ageOn('1995-06-15', '2025-06-15')).toBe(30);
    expect(ageOn('1995-06-16', '2025-06-15')).toBe(29);
  });

  it('handles a birthday later in the year', () => {
    expect(ageOn('1995-12-31', '2025-01-01')).toBe(29);
  });

  it('handles a leap-day birth date', () => {
    expect(ageOn('2000-02-29', '2025-02-28')).toBe(24);
    expect(ageOn('2000-02-29', '2025-03-01')).toBe(25);
  });
});

describe('dateRange', () => {
  it('is inclusive of both ends', () => {
    expect(dateRange('2025-01-01', '2025-01-03')).toEqual([
      '2025-01-01',
      '2025-01-02',
      '2025-01-03',
    ]);
  });

  it('returns an empty list for an inverted range', () => {
    expect(dateRange('2025-01-03', '2025-01-01')).toEqual([]);
  });
});
