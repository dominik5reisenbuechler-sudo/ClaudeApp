import { useState } from 'react';
import { View } from 'react-native';

import { BottomSheet, Button, Callout, Chip, Input, Text } from '@/components/ui';
import { PHOTO_POSES, PHOTO_POSE_LABELS } from '@/domain/progress/photos';
import type { PhotoPose } from '@/domain/progress/photos';
import { pickProgressPhoto, useAddProgressPhoto } from '@/hooks/useProgressPhotos';
import type { PickedPhoto } from '@/hooks/useProgressPhotos';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Adding a progress photo.
 *
 * Pose is asked for before the camera opens rather than after, for two reasons:
 * it is the one thing the app cannot infer from the image, and knowing you are
 * about to take a "side" shot is what makes you stand the same way you did last
 * month. A comparison is only worth anything if the two photos were taken the
 * same way.
 */
export function PhotoCapture({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const theme = useTheme();
  const add = useAddProgressPhoto();

  const [pose, setPose] = useState<PhotoPose>('front');
  const [note, setNote] = useState('');
  const [picked, setPicked] = useState<PickedPhoto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setPicked(null);
    setNote('');
    setError(null);
    onClose();
  };

  const pick = async (source: 'camera' | 'library') => {
    setError(null);
    try {
      const result = await pickProgressPhoto(source);
      // Null means the user backed out, which is not a failure to report.
      if (result) setPicked(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That did not work.');
    }
  };

  const save = () => {
    if (!picked) return;
    setError(null);

    add.mutate(
      { picked, pose, note: note.trim() === '' ? null : note.trim() },
      {
        onSuccess: close,
        onError: (cause) =>
          setError(cause instanceof Error ? cause.message : 'The photo could not be saved.'),
      },
    );
  };

  return (
    <BottomSheet visible={visible} onClose={close} title="Add a progress photo">
      <View style={{ gap: theme.spacing.lg }}>
        <Text variant="caption" tone="secondary">
          Same spot, same light, same time of day. Consistency is what makes two photos comparable —
          without it you are measuring the lighting, not yourself.
        </Text>

        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="label" tone="tertiary">
            Angle
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {PHOTO_POSES.map((option) => (
              <Chip
                key={option}
                label={PHOTO_POSE_LABELS[option]}
                selected={option === pose}
                onPress={() => setPose(option)}
              />
            ))}
          </View>
        </View>

        {picked ? (
          <Callout tone="success" title="Photo ready">
            <Text variant="caption" tone="secondary">
              {`${picked.width}×${picked.height}. It will be stored privately and shown only to you.`}
            </Text>
          </Callout>
        ) : (
          <View style={{ gap: theme.spacing.sm }}>
            <Button label="Take a photo" onPress={() => void pick('camera')} />
            <Button label="Choose from library" variant="ghost" onPress={() => void pick('library')} />
          </View>
        )}

        <Input
          label="Note (optional)"
          placeholder="Anything worth remembering about today"
          value={note}
          onChangeText={setNote}
        />

        {error ? (
          <Callout tone="warning">
            <Text variant="caption" tone="secondary">
              {error}
            </Text>
          </Callout>
        ) : null}

        {picked ? (
          <View style={{ gap: theme.spacing.sm }}>
            <Button label="Save photo" onPress={save} loading={add.isPending} />
            <Button label="Pick a different one" variant="ghost" size="sm" onPress={() => setPicked(null)} />
          </View>
        ) : null}

        <Text variant="caption" tone="tertiary">
          Photos are stored in a private bucket that only your account can read, and are included in
          both the export and the delete-everything option in your profile.
        </Text>
      </View>
    </BottomSheet>
  );
}
