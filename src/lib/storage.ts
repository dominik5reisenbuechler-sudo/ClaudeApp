import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Thin JSON wrapper over AsyncStorage.
 *
 * Every read is defensive: stored data is from a previous version of the app
 * and may not match the current shape, so a parse failure returns `null` and
 * clears the key rather than throwing during render.
 *
 * This is for *non-sensitive* local state only — theme preference, onboarding
 * draft. Auth tokens are handled by the Supabase client's own storage, and
 * health data lives in Postgres behind RLS.
 */

export async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  } catch {
    await AsyncStorage.removeItem(key).catch(() => undefined);
    return null;
  }
}

export async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage being unavailable must never break a user flow: the draft is a
    // convenience, and the authoritative copy is the database.
  }
}

export async function removeKey(key: string): Promise<void> {
  await AsyncStorage.removeItem(key).catch(() => undefined);
}
