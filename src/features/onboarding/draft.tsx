import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { draftDefaults, draftSchema } from './schema';
import type { OnboardingDraft } from './schema';
import { readJson, removeKey, writeJson } from '@/lib/storage';

/**
 * The onboarding draft.
 *
 * Onboarding asks for a lot, and a user who closes the app halfway through must
 * not lose their answers (CLAUDE.md §6). The draft is written to local storage
 * after every change and cleared only once the flow has been submitted to the
 * database successfully.
 *
 * Local storage — not the database — because these answers are incomplete and
 * unvalidated until the end, and half a profile in Postgres is harder to reason
 * about than none.
 */

const STORAGE_KEY = 'onboarding-draft-v1';

interface DraftContextValue {
  draft: OnboardingDraft;
  /** True until the persisted draft has been read. */
  isHydrated: boolean;
  update: (patch: Partial<OnboardingDraft>) => void;
  clear: () => Promise<void>;
}

const DraftContext = createContext<DraftContextValue | null>(null);

export function OnboardingDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<OnboardingDraft>(draftDefaults);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void readJson<unknown>(STORAGE_KEY).then((stored) => {
      if (cancelled) return;

      if (stored) {
        // A draft written by an older build may not match the current shape.
        // Parsing discards anything unrecognised rather than trusting it.
        const parsed = draftSchema.safeParse(stored);
        if (parsed.success) setDraft({ ...draftDefaults, ...parsed.data });
      }
      setIsHydrated(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback((patch: Partial<OnboardingDraft>) => {
    setDraft((current) => {
      const next = { ...current, ...patch };
      void writeJson(STORAGE_KEY, next);
      return next;
    });
  }, []);

  const clear = useCallback(async () => {
    setDraft(draftDefaults);
    await removeKey(STORAGE_KEY);
  }, []);

  const value = useMemo<DraftContextValue>(
    () => ({ draft, isHydrated, update, clear }),
    [draft, isHydrated, update, clear],
  );

  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}

export function useOnboardingDraft(): DraftContextValue {
  const context = useContext(DraftContext);
  if (!context) {
    throw new Error('useOnboardingDraft must be used inside an OnboardingDraftProvider');
  }
  return context;
}
