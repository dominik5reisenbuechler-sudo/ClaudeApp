import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type { DefaultValues, FieldValues, UseFormReturn } from 'react-hook-form';
import type { ZodType } from 'zod';

/**
 * One form per step, validated by that step's Zod schema.
 *
 * Validation runs on submit rather than on change: a user typing "8" into a
 * weight field should not be told 8 kg is too low before they have typed the
 * "2". Once a field has failed, it re-validates on change so the error clears
 * as soon as it is fixed.
 */
export function useStepForm<T extends FieldValues>(
  // Input and output are the same type: the step schemas validate, they do not
  // transform. Saying so is what lets `zodResolver` accept the schema.
  schema: ZodType<T, T>,
  defaultValues: DefaultValues<T>,
): UseFormReturn<T> {
  return useForm<T>({
    resolver: zodResolver(schema) as never,
    defaultValues,
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  });
}

/** First error message for a field, or undefined. */
export function errorMessage(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return undefined;
}
