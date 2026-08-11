import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Screen, ScreenHeader } from '@/components/layout';
import { Button, Callout, LoadingState, Text } from '@/components/ui';
import { MEAL_LABELS } from '@/domain/nutrition/dailyTotals';
import { CustomFoodSheet } from '@/features/nutrition/CustomFoodSheet';
import type { CustomFoodPrefill } from '@/features/nutrition/CustomFoodSheet';
import { LogFoodSheet } from '@/features/nutrition/LogFoodSheet';
import { useBarcodeLookup } from '@/hooks/useNutrition';
import { isValidBarcode, normalizeBarcode } from '@/integrations/foodProviders';
import { useTheme } from '@/theme/ThemeProvider';
import { MEAL_TYPES } from '@/types/domain';
import type { MealType } from '@/types/domain';
import type { FoodRow } from '@/types/database';
import { todayIsoDate } from '@/utils/date';

/**
 * Barcode scanning.
 *
 * The scan → lookup → log flow stays on one screen rather than passing a food
 * through route params: a product is a large object, and serialising it through
 * navigation is how the logged values and the previewed values drift apart.
 *
 * When a lookup fails, whatever the provider could salvage is handed to the
 * "add it yourself" sheet. A product with a name and a barcode but no energy
 * value should not make the user type everything from scratch.
 */
export default function ScanScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ meal?: string }>();
  const today = todayIsoDate();

  const mealType: MealType = MEAL_TYPES.includes(params.meal as MealType)
    ? (params.meal as MealType)
    : 'snack';

  const [permission, requestPermission] = useCameraPermissions();
  const lookup = useBarcodeLookup();

  const [food, setFood] = useState<FoodRow | null>(null);
  const [failure, setFailure] = useState<{ message: string; prefill: CustomFoodPrefill } | null>(
    null,
  );
  const [customOpen, setCustomOpen] = useState(false);

  /**
   * The camera fires continuously while a barcode is in frame. Without this
   * guard a single scan becomes dozens of lookups — and dozens of requests to
   * a third-party API that asks clients not to hammer it.
   */
  const isHandling = useRef(false);

  const handleScan = async (raw: string) => {
    if (isHandling.current) return;
    const barcode = normalizeBarcode(raw);
    if (!isValidBarcode(barcode)) return;

    isHandling.current = true;
    try {
      const result = await lookup.mutateAsync(barcode);

      if (result.status === 'found') {
        setFood(result.food);
        return;
      }

      setFailure({
        message: result.message,
        prefill: {
          barcode,
          ...(result.partial?.name ? { name: result.partial.name } : {}),
          brand: result.partial?.brand ?? null,
          caloriesPer100g: result.partial?.caloriesPer100g ?? null,
          proteinPer100g: result.partial?.proteinPer100g ?? null,
          carbsPer100g: result.partial?.carbsPer100g ?? null,
          fatPer100g: result.partial?.fatPer100g ?? null,
          fiberPer100g: result.partial?.fiberPer100g ?? null,
        },
      });
    } catch (caught) {
      setFailure({
        message:
          caught instanceof Error
            ? caught.message
            : 'We could not look that up. Check your connection and try again.',
        prefill: { barcode },
      });
    }
  };

  const resumeScanning = () => {
    isHandling.current = false;
    setFood(null);
    setFailure(null);
  };

  if (!permission) {
    return (
      <Screen>
        <LoadingState label="Checking camera access…" />
      </Screen>
    );
  }

  if (!permission.granted) {
    return (
      <Screen>
        <ScreenHeader
          title="Scan a barcode"
          subtitle="We need camera access to read barcodes. Nothing is recorded or uploaded — the camera is used only to read the number on the packet."
          onBack={() => router.back()}
        />
        <Button
          label={permission.canAskAgain ? 'Allow camera access' : 'Open settings to allow camera'}
          onPress={() => void requestPermission()}
        />
        <Button label="Search by name instead" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View style={{ flex: 1 }}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{
            barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'],
          }}
          onBarcodeScanned={({ data }) => void handleScan(data)}
        />

        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            padding: theme.spacing.xl,
            gap: theme.spacing.md,
            backgroundColor: theme.colors.overlay,
          }}
        >
          {lookup.isPending ? (
            <Text variant="caption" tone="onAccent" align="center">
              Looking that up…
            </Text>
          ) : (
            <Text variant="caption" tone="onAccent" align="center">
              Point the camera at the barcode on the packet
            </Text>
          )}
          <Button label="Cancel" variant="secondary" onPress={() => router.back()} />
        </View>
      </View>

      {failure ? (
        <View style={{ padding: theme.spacing.xl, gap: theme.spacing.md }}>
          <Callout tone="warning" title="Nothing usable found">
            {failure.message}
          </Callout>
          <Button label="Add it yourself" onPress={() => setCustomOpen(true)} />
          <Button label="Scan again" variant="secondary" onPress={resumeScanning} />
        </View>
      ) : null}

      <LogFoodSheet
        food={food}
        mealType={mealType}
        loggedOn={today}
        onClose={resumeScanning}
        onLogged={() => router.dismissTo(`/nutrition`)}
      />

      <CustomFoodSheet
        visible={customOpen}
        onClose={() => setCustomOpen(false)}
        {...(failure ? { prefill: failure.prefill } : {})}
        onCreated={(created) => {
          setFailure(null);
          setFood(created);
        }}
      />

      <Text variant="caption" tone="tertiary" align="center">
        {`Scanning into ${MEAL_LABELS[mealType].toLowerCase()}`}
      </Text>
    </View>
  );
}
