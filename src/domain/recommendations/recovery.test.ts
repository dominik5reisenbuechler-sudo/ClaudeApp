import { describe, expect, it } from 'vitest';

import { assessRecovery, describeConcerns, UNKNOWN_RECOVERY } from './recovery';
import type { RecoveryAnswers } from './recovery';

const answers = (over: Partial<RecoveryAnswers> = {}): RecoveryAnswers => ({
  trainingPerformance: 3,
  sleepQuality: 3,
  energy: 3,
  stress: 3,
  jointDiscomfort: 2,
  ...over,
});

describe('assessRecovery', () => {
  it('puts a middling week in the middle', () => {
    const result = assessRecovery(answers());
    expect(result.score).toBe(0.5);
    expect(result.band).toBe('neutral');
    expect(result.answeredCount).toBe(5);
  });

  it('reads a good week as good', () => {
    const result = assessRecovery(
      answers({ trainingPerformance: 5, sleepQuality: 5, energy: 4, stress: 2, jointDiscomfort: 0 }),
    );
    expect(result.band).toBe('good');
    expect(result.score).toBeGreaterThan(0.7);
  });

  it('reads a bad week as bad', () => {
    const result = assessRecovery(
      answers({ trainingPerformance: 2, sleepQuality: 1, energy: 1, stress: 5, jointDiscomfort: 3 }),
    );
    expect(result.band).toBe('poor');
    expect(result.score).toBeLessThan(0.4);
  });

  it('inverts stress — a 5 there is not a good week', () => {
    const calm = assessRecovery(answers({ stress: 1 }));
    const stressed = assessRecovery(answers({ stress: 5 }));
    expect(calm.score as number).toBeGreaterThan(stressed.score as number);
  });

  it('inverts joint discomfort too', () => {
    const fine = assessRecovery(answers({ jointDiscomfort: 0 }));
    const sore = assessRecovery(answers({ jointDiscomfort: 4 }));
    expect(fine.score as number).toBeGreaterThan(sore.score as number);
  });

  it('excludes skipped questions rather than treating them as a 3', () => {
    const partial = assessRecovery({
      trainingPerformance: 5,
      sleepQuality: 5,
      energy: null,
      stress: null,
      jointDiscomfort: null,
    });

    expect(partial.answeredCount).toBe(2);
    // Two perfect answers score 1, not 1 diluted by three imaginary threes.
    expect(partial.score).toBe(1);
    expect(partial.band).toBe('good');
  });

  it('refuses to band a single answer', () => {
    const result = assessRecovery({
      trainingPerformance: 1,
      sleepQuality: null,
      energy: null,
      stress: null,
      jointDiscomfort: null,
    });

    expect(result.score).toBe(0);
    expect(result.band).toBe('unknown');
  });

  it('returns unknown when the check-in was skipped entirely', () => {
    const result = assessRecovery({
      trainingPerformance: null,
      sleepQuality: null,
      energy: null,
      stress: null,
      jointDiscomfort: null,
    });

    expect(result).toEqual(UNKNOWN_RECOVERY);
  });

  it('names the components that dragged it down', () => {
    const result = assessRecovery(answers({ sleepQuality: 1, stress: 5 }));
    expect(result.concerns).toContain('sleep');
    expect(result.concerns).toContain('stress');
    expect(result.concerns).not.toContain('energy');
  });

  it('never leaves the 0–1 range', () => {
    const best = assessRecovery(
      answers({ trainingPerformance: 5, sleepQuality: 5, energy: 5, stress: 1, jointDiscomfort: 0 }),
    );
    const worst = assessRecovery(
      answers({ trainingPerformance: 1, sleepQuality: 1, energy: 1, stress: 5, jointDiscomfort: 4 }),
    );

    expect(best.score).toBe(1);
    expect(worst.score).toBe(0);
  });
});

describe('describeConcerns', () => {
  it('is null when there is nothing to name', () => {
    expect(describeConcerns(assessRecovery(answers()))).toBeNull();
  });

  it('names one concern plainly', () => {
    expect(describeConcerns(assessRecovery(answers({ sleepQuality: 1 })))).toBe('sleep');
  });

  it('joins several readably', () => {
    const result = describeConcerns(assessRecovery(answers({ sleepQuality: 1, energy: 1, stress: 5 })));
    expect(result).toBe('sleep, energy and stress');
  });
});
