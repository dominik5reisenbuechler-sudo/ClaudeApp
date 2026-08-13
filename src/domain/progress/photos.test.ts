import { describe, expect, it } from 'vitest';

import {
  availableComparisons,
  comparisonFor,
  extensionForMime,
  groupByDay,
  isSupportedPhotoMime,
  ownerOfPath,
  photoStoragePath,
  rejectionFor,
  MAX_PHOTO_BYTES,
  PHOTO_POSES,
} from './photos';
import type { Photo, PhotoPose } from './photos';

const USER = '11111111-2222-3333-4444-555555555555';

function photo(over: Partial<Photo> = {}): Photo {
  return {
    id: 'photo-1',
    takenOn: '2025-06-01',
    pose: 'front',
    storagePath: `${USER}/2025-06-01_front_abc.jpg`,
    weightKg: 82,
    note: null,
    ...over,
  };
}

describe('mime handling', () => {
  it('accepts the formats a phone camera actually produces', () => {
    for (const mime of ['image/jpeg', 'image/png', 'image/webp', 'image/heic']) {
      expect(isSupportedPhotoMime(mime)).toBe(true);
    }
  });

  it('is case-insensitive, because pickers are not consistent', () => {
    expect(isSupportedPhotoMime('IMAGE/JPEG')).toBe(true);
    expect(extensionForMime('Image/PNG')).toBe('png');
  });

  it('rejects anything that is not one of them', () => {
    expect(isSupportedPhotoMime('image/gif')).toBe(false);
    expect(isSupportedPhotoMime('application/pdf')).toBe(false);
    expect(isSupportedPhotoMime('video/mp4')).toBe(false);
    expect(extensionForMime('video/mp4')).toBeNull();
  });
});

describe('rejectionFor', () => {
  it('passes an ordinary phone photo', () => {
    expect(rejectionFor({ mimeType: 'image/jpeg', sizeBytes: 3_500_000 })).toBeNull();
  });

  it('names the type problem rather than just failing', () => {
    const rejection = rejectionFor({ mimeType: 'video/mp4', sizeBytes: 1000 });

    expect(rejection?.reason).toBe('unsupported_type');
    expect(rejection?.message).toMatch(/JPEG/);
  });

  it('tells the user how big the file actually was', () => {
    const rejection = rejectionFor({ mimeType: 'image/jpeg', sizeBytes: 22 * 1024 * 1024 });

    expect(rejection?.reason).toBe('too_large');
    expect(rejection?.message).toContain('22.0 MB');
    expect(rejection?.message).toContain('15 MB');
  });

  it('allows a file exactly at the limit', () => {
    expect(rejectionFor({ mimeType: 'image/jpeg', sizeBytes: MAX_PHOTO_BYTES })).toBeNull();
  });

  it('checks the type before the size — an oversized video is the wrong type', () => {
    const rejection = rejectionFor({ mimeType: 'video/mp4', sizeBytes: 90 * 1024 * 1024 });
    expect(rejection?.reason).toBe('unsupported_type');
  });
});

describe('photoStoragePath', () => {
  const base = {
    userId: USER,
    takenOn: '2025-06-01' as const,
    pose: 'front' as PhotoPose,
    mimeType: 'image/jpeg',
    suffix: 'abc123',
  };

  it('puts the owner first, because storage authorises on that segment', () => {
    const path = photoStoragePath(base);

    expect(path).toBe(`${USER}/2025-06-01_front_abc123.jpg`);
    expect(path?.startsWith(`${USER}/`)).toBe(true);
    expect(ownerOfPath(path as string)).toBe(USER);
  });

  it('separates two photos of the same pose on the same day', () => {
    const first = photoStoragePath(base);
    const second = photoStoragePath({ ...base, suffix: 'def456' });

    expect(first).not.toBe(second);
  });

  it('strips characters that would change the shape of the path', () => {
    const path = photoStoragePath({ ...base, suffix: '../../etc/passwd' });

    expect(path).not.toContain('..');
    expect(path?.split('/')).toHaveLength(2);
    expect(ownerOfPath(path as string)).toBe(USER);
  });

  it('refuses a type it has no extension for', () => {
    expect(photoStoragePath({ ...base, mimeType: 'video/mp4' })).toBeNull();
  });

  it('refuses a suffix that sanitises away to nothing', () => {
    expect(photoStoragePath({ ...base, suffix: '///' })).toBeNull();
  });

  it('is deterministic — the same inputs always give the same path', () => {
    expect(photoStoragePath(base)).toBe(photoStoragePath(base));
  });
});

describe('ownerOfPath', () => {
  it('reads the owner segment', () => {
    expect(ownerOfPath(`${USER}/2025-06-01_front_a.jpg`)).toBe(USER);
  });

  it('returns null for a path with no file part', () => {
    expect(ownerOfPath(USER)).toBeNull();
    expect(ownerOfPath('')).toBeNull();
  });
});

describe('groupByDay', () => {
  it('collapses one shoot into a single entry', () => {
    const days = groupByDay([
      photo({ id: 'a', pose: 'front' }),
      photo({ id: 'b', pose: 'side' }),
      photo({ id: 'c', pose: 'back' }),
    ]);

    expect(days).toHaveLength(1);
    expect(days[0]?.photos).toHaveLength(3);
  });

  it('orders days newest first', () => {
    const days = groupByDay([
      photo({ id: 'a', takenOn: '2025-06-01' }),
      photo({ id: 'b', takenOn: '2025-08-01' }),
      photo({ id: 'c', takenOn: '2025-07-01' }),
    ]);

    expect(days.map((day) => day.date)).toEqual(['2025-08-01', '2025-07-01', '2025-06-01']);
  });

  it('orders photos within a day front, side, back, other', () => {
    const days = groupByDay([
      photo({ id: 'd', pose: null }),
      photo({ id: 'c', pose: 'back' }),
      photo({ id: 'a', pose: 'front' }),
      photo({ id: 'b', pose: 'side' }),
    ]);

    expect(days[0]?.photos.map((p) => p.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('surfaces the weight recorded with the shoot', () => {
    const days = groupByDay([
      photo({ id: 'a', weightKg: null }),
      photo({ id: 'b', weightKg: 79.4 }),
    ]);

    expect(days[0]?.weightKg).toBe(79.4);
  });

  it('reports no weight when none was recorded', () => {
    expect(groupByDay([photo({ weightKg: null })])[0]?.weightKg).toBeNull();
  });

  it('handles an empty library', () => {
    expect(groupByDay([])).toEqual([]);
  });
});

describe('comparisonFor', () => {
  it('pairs the earliest and latest of a pose', () => {
    const comparison = comparisonFor(
      [
        photo({ id: 'a', takenOn: '2025-06-01', weightKg: 82 }),
        photo({ id: 'b', takenOn: '2025-07-01', weightKg: 80 }),
        photo({ id: 'c', takenOn: '2025-08-01', weightKg: 78.5 }),
      ],
      'front',
    );

    expect(comparison?.before.id).toBe('a');
    expect(comparison?.after.id).toBe('c');
    expect(comparison?.daysApart).toBe(61);
    expect(comparison?.weightChangeKg).toBe(-3.5);
  });

  it('is insensitive to the order photos arrive in', () => {
    const forwards = comparisonFor(
      [photo({ id: 'a', takenOn: '2025-06-01' }), photo({ id: 'b', takenOn: '2025-08-01' })],
      'front',
    );
    const backwards = comparisonFor(
      [photo({ id: 'b', takenOn: '2025-08-01' }), photo({ id: 'a', takenOn: '2025-06-01' })],
      'front',
    );

    expect(forwards?.before.id).toBe(backwards?.before.id);
    expect(forwards?.after.id).toBe(backwards?.after.id);
  });

  it('never compares across poses', () => {
    const comparison = comparisonFor(
      [
        photo({ id: 'a', takenOn: '2025-06-01', pose: 'front' }),
        photo({ id: 'b', takenOn: '2025-08-01', pose: 'back' }),
      ],
      'front',
    );

    expect(comparison).toBeNull();
  });

  it('refuses a before/after taken on the same day', () => {
    const comparison = comparisonFor(
      [
        photo({ id: 'a', takenOn: '2025-06-01' }),
        photo({ id: 'b', takenOn: '2025-06-01' }),
      ],
      'front',
    );

    expect(comparison).toBeNull();
  });

  it('returns null when a pose has a single photo', () => {
    expect(comparisonFor([photo({ id: 'a' })], 'front')).toBeNull();
  });

  it('reports no weight change when either end is missing one', () => {
    const comparison = comparisonFor(
      [
        photo({ id: 'a', takenOn: '2025-06-01', weightKg: 82 }),
        photo({ id: 'b', takenOn: '2025-08-01', weightKg: null }),
      ],
      'front',
    );

    expect(comparison?.weightChangeKg).toBeNull();
    // The pairing itself still stands — the photos are the point.
    expect(comparison?.before.id).toBe('a');
  });

  it('rounds a weight change to one decimal', () => {
    const comparison = comparisonFor(
      [
        photo({ id: 'a', takenOn: '2025-06-01', weightKg: 82.15 }),
        photo({ id: 'b', takenOn: '2025-08-01', weightKg: 80 }),
      ],
      'front',
    );

    expect(comparison?.weightChangeKg).toBe(-2.2);
  });
});

describe('availableComparisons', () => {
  it('returns one per pose that supports it, in pose order', () => {
    const comparisons = availableComparisons([
      photo({ id: 'a', takenOn: '2025-06-01', pose: 'front' }),
      photo({ id: 'b', takenOn: '2025-08-01', pose: 'front' }),
      photo({ id: 'c', takenOn: '2025-06-01', pose: 'back' }),
      photo({ id: 'd', takenOn: '2025-08-01', pose: 'back' }),
      // Only one side shot — no comparison to make.
      photo({ id: 'e', takenOn: '2025-06-01', pose: 'side' }),
    ]);

    expect(comparisons.map((c) => c.pose)).toEqual(['front', 'back']);
  });

  it('returns nothing for a library that cannot support a comparison', () => {
    expect(availableComparisons([photo()])).toEqual([]);
    expect(availableComparisons([])).toEqual([]);
  });

  it('only ever offers known poses', () => {
    const comparisons = availableComparisons([
      photo({ id: 'a', takenOn: '2025-06-01', pose: null }),
      photo({ id: 'b', takenOn: '2025-08-01', pose: null }),
    ]);

    expect(comparisons).toEqual([]);
    for (const comparison of availableComparisons([])) {
      expect(PHOTO_POSES).toContain(comparison.pose);
    }
  });
});
