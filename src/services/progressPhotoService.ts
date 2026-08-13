import { getSupabase } from '@/lib/supabase';
import { ownerOfPath, photoStoragePath } from '@/domain/progress/photos';
import type { Photo, PhotoPose } from '@/domain/progress/photos';
import type { ProgressPhotoRow } from '@/types/database';
import type { IsoDate } from '@/types/domain';

/**
 * Repository for progress photos.
 *
 * The bucket is private (migration 0012). Nothing here ever produces a public
 * URL — rendering an image means asking for a signed one that expires, so a
 * link that escapes into a log or a screenshot stops working instead of
 * standing open forever.
 *
 * Two rows of defence that look redundant and are not. Storage policies
 * authorise on the first path segment, and every function here also checks it
 * client-side before calling. The policy is what actually holds; the local
 * check turns a would-be permission error into a bug we notice in development.
 */

export const PHOTO_BUCKET = 'progress-photos';

/** How long a rendered image stays fetchable. Long enough to scroll a gallery. */
const SIGNED_URL_SECONDS = 60 * 60;

export function toPhotos(rows: readonly ProgressPhotoRow[]): Photo[] {
  return rows.map((row) => ({
    id: row.id,
    takenOn: row.taken_on,
    pose: (row.pose ?? null) as PhotoPose | null,
    storagePath: row.storage_path,
    weightKg: row.weight_kg === null ? null : Number(row.weight_kg),
    note: row.note,
  }));
}

export async function fetchProgressPhotos(userId: string): Promise<ProgressPhotoRow[]> {
  const { data, error } = await getSupabase()
    .from('progress_photos')
    .select('*')
    .eq('user_id', userId)
    .order('taken_on', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export interface UploadPhotoInput {
  takenOn: IsoDate;
  pose: PhotoPose;
  mimeType: string;
  /** The image itself, already read from the picker. */
  body: ArrayBuffer | Blob;
  /** Caller-supplied uniqueness, so the path is deterministic from the input. */
  suffix: string;
  /** What the scale said that day, if anything. */
  weightKg?: number | null;
  note?: string | null;
}

/**
 * Upload an image and record the row that points at it.
 *
 * Order matters: the object goes up first, and the row is written only if that
 * succeeded. The reverse would leave rows pointing at nothing, and a gallery
 * full of broken tiles is a worse failure than a photo that has to be picked
 * again. If the row write fails after the upload, the orphaned object is
 * removed rather than left to sit in the bucket unreferenced.
 */
export async function uploadProgressPhoto(
  userId: string,
  input: UploadPhotoInput,
): Promise<ProgressPhotoRow> {
  const path = photoStoragePath({
    userId,
    takenOn: input.takenOn,
    pose: input.pose,
    mimeType: input.mimeType,
    suffix: input.suffix,
  });

  if (path === null) throw new Error('That image type cannot be stored.');

  const supabase = getSupabase();

  const upload = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, input.body, { contentType: input.mimeType, upsert: false });
  if (upload.error) throw new Error(upload.error.message);

  const { data, error } = await supabase
    .from('progress_photos')
    .insert({
      user_id: userId,
      taken_on: input.takenOn,
      storage_path: path,
      pose: input.pose,
      weight_kg: input.weightKg ?? null,
      note: input.note ?? null,
    })
    .select('*')
    .single();

  if (error || !data) {
    await supabase.storage.from(PHOTO_BUCKET).remove([path]);
    throw new Error(error?.message ?? 'The photo uploaded but could not be recorded.');
  }

  return data;
}

/**
 * Short-lived URLs for a batch of paths.
 *
 * Returns a map rather than an array so a failure to sign one image leaves the
 * rest of the gallery intact — one expired or missing object should not blank
 * the screen.
 */
export async function signPhotoUrls(
  userId: string,
  paths: readonly string[],
): Promise<Map<string, string>> {
  const mine = paths.filter((path) => ownerOfPath(path) === userId);
  const signed = new Map<string, string>();
  if (mine.length === 0) return signed;

  const { data, error } = await getSupabase()
    .storage.from(PHOTO_BUCKET)
    .createSignedUrls([...mine], SIGNED_URL_SECONDS);
  if (error) throw new Error(error.message);

  for (const entry of data ?? []) {
    if (entry.signedUrl && entry.path) signed.set(entry.path, entry.signedUrl);
  }
  return signed;
}

/**
 * Delete a photo and the object behind it.
 *
 * The object goes first here, for the opposite reason to upload: a row without
 * an object is a broken tile, but an object without a row is an image the user
 * believes they deleted and cannot see or reach. Of the two ways to fail, only
 * one breaks a promise about their data.
 */
export async function deleteProgressPhoto(userId: string, photo: Photo): Promise<void> {
  if (ownerOfPath(photo.storagePath) !== userId) {
    throw new Error('That photo does not belong to this account.');
  }

  const supabase = getSupabase();

  const removal = await supabase.storage.from(PHOTO_BUCKET).remove([photo.storagePath]);
  if (removal.error) throw new Error(removal.error.message);

  const { error } = await supabase
    .from('progress_photos')
    .delete()
    .eq('id', photo.id)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
}
