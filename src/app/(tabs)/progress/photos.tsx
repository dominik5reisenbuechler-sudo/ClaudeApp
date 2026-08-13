import { useState } from 'react';
import { Image, View } from 'react-native';

import { Screen, ScreenHeader, SectionHeader } from '@/components/layout';
import {
  Button,
  Callout,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Text,
} from '@/components/ui';
import { PHOTO_POSE_LABELS } from '@/domain/progress/photos';
import type { Photo, PhotoComparison, PhotoDay } from '@/domain/progress/photos';
import { PhotoCapture } from '@/features/progress/PhotoCapture';
import { ProgressSubNav } from '@/features/progress/ProgressSubNav';
import { useDeleteProgressPhoto, useProgressPhotos } from '@/hooks/useProgressPhotos';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * The photo timeline.
 *
 * The scale is one number and it lies for a week at a time. A photo taken under
 * the same conditions is often the only honest evidence that a hard eight weeks
 * did anything — and during a recomposition, where the weight genuinely does not
 * move, it is the only evidence at all.
 *
 * Comparisons are offered rather than assembled automatically. The app will pair
 * the oldest and newest shot of a pose, but it will not pair across poses or
 * within a single day, because both of those produce a picture that argues for a
 * change nothing actually measured.
 */
export default function ProgressPhotosScreen() {
  const theme = useTheme();
  const { days, comparisons, urlFor, isLoading, isError, refetch } = useProgressPhotos();
  const [capturing, setCapturing] = useState(false);

  if (isLoading) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  if (isError) {
    return (
      <Screen>
        <ErrorState message="We could not load your photos." onRetry={() => void refetch()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader
        eyebrow="Progress"
        title="Photos"
        subtitle="The measurement the scale cannot make"
      />
      <ProgressSubNav active="photos" />

      {days.length === 0 ? (
        <EmptyState
          title="No photos yet"
          message="Take the first one today. It is worth nothing on its own and a great deal in eight weeks — which is exactly why the best time to start is before you can see any difference."
          actionLabel="Add a photo"
          onAction={() => setCapturing(true)}
        />
      ) : (
        <>
          <Button label="Add a photo" onPress={() => setCapturing(true)} />

          {comparisons.length > 0 ? (
            <View style={{ gap: theme.spacing.md }}>
              <SectionHeader title="Then and now" />
              {comparisons.map((comparison) => (
                <ComparisonCard
                  key={comparison.pose}
                  comparison={comparison}
                  urlFor={urlFor}
                />
              ))}
            </View>
          ) : (
            <Callout tone="info" title="A comparison needs two days">
              Once you have the same angle from two different dates, they will appear here side by
              side.
            </Callout>
          )}

          <View style={{ gap: theme.spacing.md }}>
            <SectionHeader title="Timeline" />
            {days.map((day) => (
              <DayCard key={day.date} day={day} urlFor={urlFor} />
            ))}
          </View>
        </>
      )}

      <Text variant="caption" tone="tertiary">
        Photos are private to your account and served through links that expire. They are included
        in your data export, and deleted with everything else if you delete your account.
      </Text>

      <PhotoCapture visible={capturing} onClose={() => setCapturing(false)} />
    </Screen>
  );
}

function ComparisonCard({
  comparison,
  urlFor,
}: {
  comparison: PhotoComparison;
  urlFor: (photo: Photo) => string | null;
}) {
  const theme = useTheme();
  const weeks = Math.round(comparison.daysApart / 7);

  return (
    <Card>
      <View style={{ gap: theme.spacing.sm }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text variant="bodyStrong">{PHOTO_POSE_LABELS[comparison.pose]}</Text>
          <Text variant="caption" tone="tertiary">
            {weeks >= 1 ? `${weeks} ${weeks === 1 ? 'week' : 'weeks'} apart` : `${comparison.daysApart} days apart`}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          <Thumb photo={comparison.before} url={urlFor(comparison.before)} caption="Before" />
          <Thumb photo={comparison.after} url={urlFor(comparison.after)} caption="After" />
        </View>

        {comparison.weightChangeKg !== null ? (
          <Text variant="caption" tone="secondary">
            {`${comparison.weightChangeKg > 0 ? '+' : ''}${comparison.weightChangeKg} kg over that period.`}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

function DayCard({ day, urlFor }: { day: PhotoDay; urlFor: (photo: Photo) => string | null }) {
  const theme = useTheme();
  const remove = useDeleteProgressPhoto();

  return (
    <Card>
      <View style={{ gap: theme.spacing.sm }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text variant="bodyStrong">{day.date}</Text>
          {day.weightKg !== null ? (
            <Text variant="mono" tone="secondary">
              {day.weightKg} kg
            </Text>
          ) : null}
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          {day.photos.map((photo) => (
            <Thumb
              key={photo.id}
              photo={photo}
              url={urlFor(photo)}
              caption={photo.pose ? PHOTO_POSE_LABELS[photo.pose] : 'Photo'}
              onDelete={() => remove.mutate(photo)}
            />
          ))}
        </View>

        {day.photos.find((photo) => photo.note !== null) ? (
          <Text variant="caption" tone="secondary">
            {day.photos.find((photo) => photo.note !== null)?.note}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

function Thumb({
  photo,
  url,
  caption,
  onDelete,
}: {
  photo: Photo;
  url: string | null;
  caption: string;
  onDelete?: () => void;
}) {
  const theme = useTheme();

  return (
    <View style={{ gap: theme.spacing.xs, flex: 1, minWidth: 120 }}>
      {url ? (
        <Image
          source={{ uri: url }}
          style={{
            width: '100%',
            aspectRatio: 3 / 4,
            borderRadius: theme.radii.md,
            backgroundColor: theme.colors.surfaceElevated,
          }}
          resizeMode="cover"
          accessibilityLabel={`${caption} photo from ${photo.takenOn}`}
        />
      ) : (
        // A URL that failed to sign leaves the entry readable rather than
        // blanking the timeline it belongs to.
        <View
          style={{
            width: '100%',
            aspectRatio: 3 / 4,
            borderRadius: theme.radii.md,
            backgroundColor: theme.colors.surfaceElevated,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text variant="caption" tone="tertiary">
            Unavailable
          </Text>
        </View>
      )}

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="caption" tone="tertiary">
          {caption}
        </Text>
        {onDelete ? (
          <Button label="Delete" variant="ghost" size="sm" fullWidth={false} onPress={onDelete} />
        ) : null}
      </View>
    </View>
  );
}
