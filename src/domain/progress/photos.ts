/**
 * Progress photos.
 *
 * The scale is a single number and it lies for a week at a time — water, sodium,
 * glycogen, where you are in a cycle. A photo taken under the same conditions is
 * often the only honest evidence that eight weeks of work changed anything, and
 * it is the one measurement that keeps meaning something when the weight does
 * not move at all (recomposition looks like failure on a scale).
 *
 * This module is pure: naming, grouping and pairing. Nothing here touches a
 * file, a network or a clock — the upload flow supplies the date and a unique
 * suffix, which is also what makes every path in here reproducible in a test.
 *
 * The one rule the rest of the app depends on: **the first path segment is the
 * owner's id.** Storage policies authorise on exactly that segment (migration
 * 0012), so a path built any other way is not a cosmetic mistake — it is a
 * permission failure waiting to happen.
 */

import type { IsoDate } from '@/types/domain';
import { daysBetween } from '@/utils/date';

export const PHOTO_POSES = ['front', 'side', 'back', 'other'] as const;
export type PhotoPose = (typeof PHOTO_POSES)[number];

export const PHOTO_POSE_LABELS: Record<PhotoPose, string> = {
  front: 'Front',
  side: 'Side',
  back: 'Back',
  other: 'Other',
};

/**
 * What the bucket accepts, mirroring `allowed_mime_types` in migration 0012.
 *
 * Duplicated deliberately: the client copy turns a rejected upload into a
 * sentence before it is attempted, and the bucket copy is what actually holds
 * when the client is wrong or bypassed.
 */
export const PHOTO_MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
};

export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

export function isSupportedPhotoMime(mime: string): boolean {
  return mime.toLowerCase() in PHOTO_MIME_EXTENSIONS;
}

export function extensionForMime(mime: string): string | null {
  return PHOTO_MIME_EXTENSIONS[mime.toLowerCase()] ?? null;
}

export interface PhotoRejection {
  reason: 'unsupported_type' | 'too_large';
  message: string;
}

/**
 * Whether a picked file can be uploaded at all.
 *
 * Returns the reason rather than a boolean, because "that did not work" is not
 * something a user can act on and "HEIC photos are fine, this one is 22 MB" is.
 */
export function rejectionFor(file: { mimeType: string; sizeBytes: number }): PhotoRejection | null {
  if (!isSupportedPhotoMime(file.mimeType)) {
    return {
      reason: 'unsupported_type',
      message: 'That file is not an image we can store. JPEG, PNG, WebP and HEIC all work.',
    };
  }

  if (file.sizeBytes > MAX_PHOTO_BYTES) {
    const mb = (file.sizeBytes / (1024 * 1024)).toFixed(1);
    return {
      reason: 'too_large',
      message: `That photo is ${mb} MB, and the limit is 15 MB. Most phone cameras stay well under it.`,
    };
  }

  return null;
}

/**
 * Where a photo lives in the bucket.
 *
 * `<user_id>/<date>_<pose>_<suffix>.<ext>` — owner first because the storage
 * policy authorises on it, then date and pose so the raw bucket is legible to a
 * human staring at it during an incident, then a caller-supplied suffix so two
 * photos of the same pose on the same day cannot collide.
 */
export function photoStoragePath(input: {
  userId: string;
  takenOn: IsoDate;
  pose: PhotoPose;
  mimeType: string;
  /** Caller-supplied uniqueness. A uuid in the app; a fixed string in tests. */
  suffix: string;
}): string | null {
  const extension = extensionForMime(input.mimeType);
  if (extension === null) return null;

  const safeSuffix = input.suffix.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 12);
  if (safeSuffix === '') return null;

  return `${input.userId}/${input.takenOn}_${input.pose}_${safeSuffix}.${extension}`;
}

/** The owner a path claims, for asserting before a delete. */
export function ownerOfPath(path: string): string | null {
  const [owner, ...rest] = path.split('/');
  if (!owner || rest.length === 0) return null;
  return owner;
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

export interface Photo {
  id: string;
  takenOn: IsoDate;
  pose: PhotoPose | null;
  storagePath: string;
  weightKg: number | null;
  note: string | null;
}

export interface PhotoDay {
  date: IsoDate;
  photos: Photo[];
  /** The weight recorded alongside, when any photo that day carried one. */
  weightKg: number | null;
}

/**
 * Photos grouped into the sessions they were taken in, newest first.
 *
 * A "session" is a date, not a timestamp: three angles shot in one minute are
 * one entry in a timeline, and showing them as three would bury a six-month
 * history under a single afternoon.
 */
export function groupByDay(photos: readonly Photo[]): PhotoDay[] {
  const byDate = new Map<IsoDate, Photo[]>();
  for (const photo of photos) {
    byDate.set(photo.takenOn, [...(byDate.get(photo.takenOn) ?? []), photo]);
  }

  return [...byDate.entries()]
    .map(([date, dayPhotos]) => ({
      date,
      photos: [...dayPhotos].sort(byPoseThenId),
      weightKg: dayPhotos.find((photo) => photo.weightKg !== null)?.weightKg ?? null,
    }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

function byPoseThenId(a: Photo, b: Photo): number {
  const rank = (photo: Photo): number =>
    photo.pose === null ? PHOTO_POSES.length : PHOTO_POSES.indexOf(photo.pose);

  const difference = rank(a) - rank(b);
  return difference !== 0 ? difference : a.id.localeCompare(b.id);
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

export interface PhotoComparison {
  pose: PhotoPose;
  before: Photo;
  after: Photo;
  daysApart: number;
  /** Weight change between the two, when both carried one. */
  weightChangeKg: number | null;
}

/**
 * The most useful before/after the library can support for a pose.
 *
 * Two rules, both about not overstating what a picture shows.
 *
 * Same pose only: a front shot against a side shot is not a comparison, it is
 * two different photographs, and putting them side by side invites a conclusion
 * neither supports.
 *
 * Different days only: the earliest and latest of a single afternoon are the
 * same body under the same light, and labelling that "before and after" is the
 * exact trick this app exists not to play.
 */
export function comparisonFor(photos: readonly Photo[], pose: PhotoPose): PhotoComparison | null {
  const matching = photos
    .filter((photo) => photo.pose === pose)
    .sort((a, b) => (a.takenOn < b.takenOn ? -1 : 1));

  const before = matching[0];
  const after = matching[matching.length - 1];

  if (!before || !after || before.takenOn === after.takenOn) return null;

  return {
    pose,
    before,
    after,
    daysApart: daysBetween(before.takenOn, after.takenOn),
    weightChangeKg:
      before.weightKg !== null && after.weightKg !== null
        ? Math.round((after.weightKg - before.weightKg) * 10) / 10
        : null,
  };
}

/** Every pose that has a comparison worth showing. */
export function availableComparisons(photos: readonly Photo[]): PhotoComparison[] {
  return PHOTO_POSES.map((pose) => comparisonFor(photos, pose)).filter(
    (comparison): comparison is PhotoComparison => comparison !== null,
  );
}
