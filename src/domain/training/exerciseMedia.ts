/**
 * Exercise demonstrations.
 *
 * Written cues tell you what to do; they are poor at telling you what it looks
 * like. "Keep the shoulder blades retracted" means nothing until you have seen
 * someone do it, so every exercise offers a way to watch one.
 *
 * The honest part of this module is what it does when there is no video. A
 * hard-coded YouTube id that turns out to be wrong is worse than no link at
 * all: it sends someone to an unrelated clip, or to a deleted one, with the
 * app's authority behind it. So a missing video falls back to a **search** for
 * that exact exercise, which cannot rot and cannot point somewhere false. The
 * UI labels the two differently, because "watch this" and "find one" are
 * different promises.
 *
 * On length: the search is filtered to Shorts, which is as close to "under a
 * minute" as a URL can get. It is a bias, not a guarantee — YouTube allows
 * Shorts longer than that — and nothing here claims a duration it cannot check.
 */

/** YouTube ids are exactly 11 characters of this alphabet. */
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'www.youtu.be',
]);

export type VideoForm = 'watch' | 'shorts';

export interface ParsedVideo {
  videoId: string;
  form: VideoForm;
}

/**
 * The video id in a YouTube URL, in any of the shapes one is written in.
 *
 * Returns null for anything that is not YouTube. That is a deliberate limit
 * rather than an oversight: this renders as a tappable link inside the app, and
 * "some URL an exercise row happened to contain" is a wider promise than the
 * seed data can keep.
 */
export function parseYouTubeUrl(raw: string | null | undefined): ParsedVideo | null {
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (!YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) return null;

  // youtu.be/<id>
  if (url.hostname.toLowerCase().endsWith('youtu.be')) {
    return asParsed(url.pathname.slice(1), 'watch');
  }

  // youtube.com/watch?v=<id>
  const queryId = url.searchParams.get('v');
  if (queryId !== null) return asParsed(queryId, 'watch');

  // youtube.com/shorts/<id> and youtube.com/embed/<id>
  const [, segment, id] = url.pathname.split('/');
  if (segment === 'shorts') return asParsed(id, 'shorts');
  if (segment === 'embed' || segment === 'v') return asParsed(id, 'watch');

  return null;
}

function asParsed(candidate: string | undefined, form: VideoForm): ParsedVideo | null {
  const videoId = (candidate ?? '').split(/[?&#/]/)[0] ?? '';
  return VIDEO_ID.test(videoId) ? { videoId, form } : null;
}

/** A still from the video, for a tappable preview. */
export function youTubeThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

/**
 * Canonical watch URL.
 *
 * Shorts are normalised to `/watch` on purpose: the shorts player is awkward
 * for studying a movement — it autoplays into the next clip and is hard to
 * scrub — and the same video at /watch scrubs frame by frame.
 */
export function youTubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/**
 * A search for demonstrations of an exercise.
 *
 * `sp=EgIYAQ%253D%253D` is YouTube's "Shorts" result filter, which biases
 * towards clips short enough to watch between sets.
 */
export function demoSearchUrl(exerciseName: string): string {
  const query = encodeURIComponent(`${exerciseName} proper form technique`);
  return `https://www.youtube.com/results?search_query=${query}&sp=EgIYAQ%253D%253D`;
}

export type ExerciseDemo =
  | {
      kind: 'video';
      url: string;
      thumbnailUrl: string;
      videoId: string;
      /** How the URL was written, before normalisation. */
      form: VideoForm;
    }
  | {
      kind: 'search';
      url: string;
    };

/**
 * How to show someone this movement.
 *
 * A `video` is a specific clip the catalogue vouches for. A `search` is an
 * offer to go and find one — same intent, weaker claim, and the UI says so.
 */
export function demoFor(exercise: { name: string; videoUrl?: string | null }): ExerciseDemo {
  const parsed = parseYouTubeUrl(exercise.videoUrl);

  if (parsed) {
    return {
      kind: 'video',
      url: youTubeWatchUrl(parsed.videoId),
      thumbnailUrl: youTubeThumbnailUrl(parsed.videoId),
      videoId: parsed.videoId,
      form: parsed.form,
    };
  }

  return { kind: 'search', url: demoSearchUrl(exercise.name) };
}

// ---------------------------------------------------------------------------
// Written cues
// ---------------------------------------------------------------------------

export interface ExerciseCoaching {
  /** Ordered steps. Empty when the catalogue has none. */
  instructions: string[];
  /** What usually goes wrong. Empty when the catalogue has none. */
  commonMistakes: string[];
  romNotes: string | null;
  hasAnything: boolean;
}

/**
 * The written half of a demonstration, normalised.
 *
 * Postgres `text[]` columns arrive as arrays that may be empty, and blank
 * strings inside them render as mystery bullet points. Filtering here means no
 * screen has to remember to.
 */
export function coachingFor(exercise: {
  instructions?: readonly string[] | null;
  common_mistakes?: readonly string[] | null;
  rom_notes?: string | null;
}): ExerciseCoaching {
  const clean = (values: readonly string[] | null | undefined): string[] =>
    (values ?? []).map((value) => value.trim()).filter((value) => value !== '');

  const instructions = clean(exercise.instructions);
  const commonMistakes = clean(exercise.common_mistakes);
  const romNotes = exercise.rom_notes?.trim() ?? '';

  return {
    instructions,
    commonMistakes,
    romNotes: romNotes === '' ? null : romNotes,
    hasAnything: instructions.length > 0 || commonMistakes.length > 0 || romNotes !== '',
  };
}
