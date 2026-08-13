import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';

import { useAuth } from '@/features/auth/AuthProvider';
import {
  availableComparisons,
  groupByDay,
  rejectionFor,
} from '@/domain/progress/photos';
import type { Photo, PhotoPose } from '@/domain/progress/photos';
import {
  deleteProgressPhoto,
  fetchProgressPhotos,
  signPhotoUrls,
  toPhotos,
  uploadProgressPhoto,
} from '@/services/progressPhotoService';
import { useWeightLogs } from './useLogs';
import type { IsoDate } from '@/types/domain';
import { todayIsoDate } from '@/utils/date';

/**
 * Progress photos.
 *
 * The picker, the upload and the signed URLs live here; the grouping and
 * pairing they feed live in `domain/progress/photos.ts`, which is what makes
 * the interesting part testable without a bucket.
 *
 * Signed URLs are a separate query from the rows on purpose. They expire, the
 * rows do not, so refreshing the images must not mean refetching the library —
 * and a signing failure leaves the timeline readable rather than blanking it.
 */

const PHOTO_KEY = 'progress-photos';

export function useProgressPhotos() {
  const { user } = useAuth();
  const userId = user?.id;

  const rows = useQuery({
    queryKey: [PHOTO_KEY, userId ?? 'anonymous'],
    queryFn: () => fetchProgressPhotos(userId as string),
    enabled: Boolean(userId),
  });

  const photos = useMemo(() => toPhotos(rows.data ?? []), [rows.data]);
  const paths = useMemo(() => photos.map((photo) => photo.storagePath), [photos]);

  const urls = useQuery({
    queryKey: [PHOTO_KEY, userId ?? 'anonymous', 'signed', paths.join('|')],
    queryFn: () => signPhotoUrls(userId as string, paths),
    enabled: Boolean(userId) && paths.length > 0,
    // Comfortably inside the hour the URLs are signed for.
    staleTime: 30 * 60_000,
  });

  return useMemo(
    () => ({
      photos,
      days: groupByDay(photos),
      comparisons: availableComparisons(photos),
      urlFor: (photo: Photo): string | null => urls.data?.get(photo.storagePath) ?? null,
      isLoading: rows.isLoading,
      isError: rows.isError,
      refetch: rows.refetch,
    }),
    [photos, urls.data, rows.isLoading, rows.isError, rows.refetch],
  );
}

export interface PickedPhoto {
  uri: string;
  mimeType: string;
  sizeBytes: number;
  width: number;
  height: number;
}

/**
 * Ask for an image, from the camera or the library.
 *
 * Returns null when the user backs out, which is not an error and must not be
 * reported as one. A refused permission is different — that gets a message,
 * because the user needs to know why nothing happened.
 */
export async function pickProgressPhoto(source: 'camera' | 'library'): Promise<PickedPhoto | null> {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (!permission.granted) {
    throw new Error(
      source === 'camera'
        ? 'Camera access is off for this app. You can turn it on in your device settings.'
        : 'Photo access is off for this app. You can turn it on in your device settings.',
    );
  }

  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: false,
    // Re-encoding costs some detail but keeps a 12 MP phone photo well inside
    // the bucket ceiling, which matters more on a gallery of dozens.
    quality: 0.8,
    exif: false,
  };

  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);

  if (result.canceled) return null;

  const asset = result.assets[0];
  if (!asset) return null;

  return {
    uri: asset.uri,
    mimeType: asset.mimeType ?? 'image/jpeg',
    sizeBytes: asset.fileSize ?? 0,
    width: asset.width,
    height: asset.height,
  };
}

export interface AddPhotoInput {
  picked: PickedPhoto;
  pose: PhotoPose;
  takenOn?: IsoDate;
  note?: string | null;
}

export function useAddProgressPhoto() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const weights = useWeightLogs(14);

  return useMutation({
    mutationFn: async (input: AddPhotoInput) => {
      const rejection = rejectionFor({
        mimeType: input.picked.mimeType,
        sizeBytes: input.picked.sizeBytes,
      });
      // A size of 0 means the picker did not report one, not an empty file.
      if (rejection && !(rejection.reason === 'too_large' && input.picked.sizeBytes === 0)) {
        throw new Error(rejection.message);
      }

      const takenOn = input.takenOn ?? todayIsoDate();

      // Snapshotted, not joined: see ProgressPhotoRow. Only that day's weigh-in
      // counts — pairing a photo with a reading from last week would caption it
      // with a number that was never true of it.
      const sameDay = (weights.data ?? []).find((point) => point.date === takenOn);

      const response = await fetch(input.picked.uri);
      const body = await response.blob();

      return uploadProgressPhoto(user?.id as string, {
        takenOn,
        pose: input.pose,
        mimeType: input.picked.mimeType,
        body,
        suffix: randomSuffix(),
        weightKg: sameDay?.weightKg ?? null,
        note: input.note ?? null,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [PHOTO_KEY] });
    },
  });
}

export function useDeleteProgressPhoto() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (photo: Photo) => deleteProgressPhoto(user?.id as string, photo),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [PHOTO_KEY] });
    },
  });
}

/**
 * Uniqueness for a storage path.
 *
 * Kept out of the domain module deliberately — `photoStoragePath` takes the
 * suffix as an argument precisely so it stays a pure function of its inputs and
 * every path in a test is reproducible.
 */
function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}
