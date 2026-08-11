import { useState } from 'react';
import { View } from 'react-native';

import { BottomSheet, Button, Callout, Input, NumberInput, Text } from '@/components/ui';
import { useCreateCustomFood } from '@/hooks/useNutrition';
import { useTheme } from '@/theme/ThemeProvider';
import type { FoodRow } from '@/types/database';

export interface CustomFoodPrefill {
  name?: string;
  brand?: string | null;
  barcode?: string | null;
  caloriesPer100g?: number | null;
  proteinPer100g?: number | null;
  carbsPer100g?: number | null;
  fatPer100g?: number | null;
  fiberPer100g?: number | null;
}

interface CustomFoodSheetProps {
  visible: boolean;
  onClose: () => void;
  /**
   * Values salvaged from a failed provider lookup. A product whose name and
   * barcode we know but whose energy value is missing should not make the user
   * type everything again.
   */
  prefill?: CustomFoodPrefill;
  onCreated?: (food: FoodRow) => void;
}

export function CustomFoodSheet({ visible, onClose, prefill, onCreated }: CustomFoodSheetProps) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Add a food">
      {visible ? (
        <SheetBody
          onClose={onClose}
          {...(prefill ? { prefill } : {})}
          {...(onCreated ? { onCreated } : {})}
        />
      ) : null}
    </BottomSheet>
  );
}

function SheetBody({ onClose, prefill, onCreated }: Omit<CustomFoodSheetProps, 'visible'>) {
  const theme = useTheme();
  const createFood = useCreateCustomFood();

  const [name, setName] = useState(prefill?.name ?? '');
  const [brand, setBrand] = useState(prefill?.brand ?? '');
  const [calories, setCalories] = useState<number | null>(prefill?.caloriesPer100g ?? null);
  const [protein, setProtein] = useState<number | null>(prefill?.proteinPer100g ?? null);
  const [carbs, setCarbs] = useState<number | null>(prefill?.carbsPer100g ?? null);
  const [fat, setFat] = useState<number | null>(prefill?.fatPer100g ?? null);
  const [fiber, setFiber] = useState<number | null>(prefill?.fiberPer100g ?? null);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (name.trim().length === 0) {
      setError('Give the food a name');
      return;
    }
    if (calories === null || calories < 0) {
      setError('Calories per 100 g are required');
      return;
    }
    if (calories > 900) {
      setError('No food exceeds 900 kcal per 100 g — please check the label');
      return;
    }

    setError(null);
    try {
      const food = await createFood.mutateAsync({
        name,
        brand: brand.trim() || null,
        barcode: prefill?.barcode ?? null,
        caloriesPer100g: calories,
        proteinPer100g: protein,
        carbsPer100g: carbs,
        fatPer100g: fat,
        fiberPer100g: fiber,
      });
      onCreated?.(food);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save. Please try again.');
    }
  };

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <Text variant="caption" tone="tertiary">
        Enter the values per 100 g, as printed on the label. This food is saved to your account
        only.
      </Text>

      <Input label="Name" value={name} onChangeText={setName} autoCapitalize="sentences" />
      <Input label="Brand (optional)" value={brand} onChangeText={setBrand} />

      <NumberInput
        label="Calories per 100 g"
        suffix="kcal"
        precision={0}
        value={calories}
        onChangeValue={(value) => {
          setCalories(value);
          setError(null);
        }}
      />

      <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
        <NumberInput
          label="Protein"
          suffix="g"
          value={protein}
          onChangeValue={setProtein}
          containerStyle={{ flex: 1 }}
        />
        <NumberInput
          label="Carbs"
          suffix="g"
          value={carbs}
          onChangeValue={setCarbs}
          containerStyle={{ flex: 1 }}
        />
      </View>

      <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
        <NumberInput
          label="Fat"
          suffix="g"
          value={fat}
          onChangeValue={setFat}
          containerStyle={{ flex: 1 }}
        />
        <NumberInput
          label="Fibre"
          suffix="g"
          value={fiber}
          onChangeValue={setFiber}
          containerStyle={{ flex: 1 }}
        />
      </View>

      {error ? (
        <Callout tone="danger">
          <Text variant="caption" tone="danger">
            {error}
          </Text>
        </Callout>
      ) : null}

      <Button label="Save food" loading={createFood.isPending} onPress={() => void handleCreate()} />
    </View>
  );
}
