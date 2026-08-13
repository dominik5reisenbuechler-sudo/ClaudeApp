import { describe, expect, it } from 'vitest';

import {
  coachingFor,
  demoFor,
  demoSearchUrl,
  parseYouTubeUrl,
  youTubeThumbnailUrl,
  youTubeWatchUrl,
} from './exerciseMedia';

const ID = 'dQw4w9WgXcQ';

describe('parseYouTubeUrl', () => {
  it.each([
    [`https://www.youtube.com/watch?v=${ID}`, 'watch'],
    [`https://youtube.com/watch?v=${ID}`, 'watch'],
    [`https://m.youtube.com/watch?v=${ID}`, 'watch'],
    [`https://youtu.be/${ID}`, 'watch'],
    [`https://www.youtube.com/embed/${ID}`, 'watch'],
    [`https://www.youtube.com/shorts/${ID}`, 'shorts'],
  ])('reads %s', (url, form) => {
    expect(parseYouTubeUrl(url)).toEqual({ videoId: ID, form });
  });

  it('ignores extra query parameters', () => {
    expect(parseYouTubeUrl(`https://www.youtube.com/watch?v=${ID}&t=42s&list=PL123`)?.videoId).toBe(
      ID,
    );
  });

  it('strips a timestamp from a short link', () => {
    expect(parseYouTubeUrl(`https://youtu.be/${ID}?t=42`)?.videoId).toBe(ID);
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseYouTubeUrl(`  https://youtu.be/${ID}  `)?.videoId).toBe(ID);
  });

  it('returns null for a missing url', () => {
    expect(parseYouTubeUrl(null)).toBeNull();
    expect(parseYouTubeUrl(undefined)).toBeNull();
    expect(parseYouTubeUrl('')).toBeNull();
  });

  it('returns null for something that is not a url at all', () => {
    expect(parseYouTubeUrl('not a url')).toBeNull();
    expect(parseYouTubeUrl('barbell bench press')).toBeNull();
  });

  it('refuses hosts that are not YouTube', () => {
    expect(parseYouTubeUrl(`https://vimeo.com/watch?v=${ID}`)).toBeNull();
    expect(parseYouTubeUrl(`https://example.com/watch?v=${ID}`)).toBeNull();
  });

  it('is not fooled by a lookalike host', () => {
    expect(parseYouTubeUrl(`https://youtube.com.evil.test/watch?v=${ID}`)).toBeNull();
    expect(parseYouTubeUrl(`https://notyoutube.com/watch?v=${ID}`)).toBeNull();
  });

  it('refuses a non-http scheme', () => {
    expect(parseYouTubeUrl(`javascript:alert(1)//youtube.com/watch?v=${ID}`)).toBeNull();
  });

  it('refuses an id of the wrong shape', () => {
    expect(parseYouTubeUrl('https://www.youtube.com/watch?v=tooshort')).toBeNull();
    expect(parseYouTubeUrl('https://www.youtube.com/watch?v=waaaaaaaaaaaaytoolong')).toBeNull();
    expect(parseYouTubeUrl('https://www.youtube.com/watch?v=has spaces')).toBeNull();
  });

  it('returns null for a YouTube page that is not a video', () => {
    expect(parseYouTubeUrl('https://www.youtube.com/results?search_query=squat')).toBeNull();
    expect(parseYouTubeUrl('https://www.youtube.com/@somechannel')).toBeNull();
  });
});

describe('url builders', () => {
  it('normalises a shorts link to the scrubbable player', () => {
    const demo = demoFor({ name: 'Back Squat', videoUrl: `https://www.youtube.com/shorts/${ID}` });

    expect(demo.kind).toBe('video');
    expect(demo.url).toBe(`https://www.youtube.com/watch?v=${ID}`);
    // How it was written is still reported, without changing where it goes.
    expect(demo.kind === 'video' && demo.form).toBe('shorts');
  });

  it('builds a thumbnail from the id', () => {
    expect(youTubeThumbnailUrl(ID)).toBe(`https://i.ytimg.com/vi/${ID}/hqdefault.jpg`);
  });

  it('builds a watch url from the id', () => {
    expect(youTubeWatchUrl(ID)).toBe(`https://www.youtube.com/watch?v=${ID}`);
  });

  it('escapes an exercise name into the search query', () => {
    const url = demoSearchUrl('Bulgarian Split Squat');

    expect(url).toContain('Bulgarian%20Split%20Squat');
    expect(url).not.toContain(' ');
  });

  it('filters the search towards short clips', () => {
    expect(demoSearchUrl('Push-Up')).toContain('sp=EgIYAQ');
  });
});

describe('demoFor', () => {
  it('vouches for a video when the catalogue has one', () => {
    const demo = demoFor({ name: 'Barbell Row', videoUrl: `https://youtu.be/${ID}` });

    expect(demo.kind).toBe('video');
    expect(demo.kind === 'video' && demo.videoId).toBe(ID);
  });

  it('falls back to a search rather than inventing a link', () => {
    const demo = demoFor({ name: 'Face Pull', videoUrl: null });

    expect(demo.kind).toBe('search');
    expect(demo.url).toContain('Face%20Pull');
  });

  it('falls back to a search when the stored url is unusable', () => {
    // A wrong link with the app's authority behind it is worse than no link.
    expect(demoFor({ name: 'Dip', videoUrl: 'https://example.com/dip' }).kind).toBe('search');
    expect(demoFor({ name: 'Dip', videoUrl: 'not a url' }).kind).toBe('search');
  });

  it('always offers something', () => {
    for (const videoUrl of [null, undefined, '', 'rubbish', `https://youtu.be/${ID}`]) {
      expect(demoFor({ name: 'Plank', videoUrl }).url).toMatch(/^https:\/\//);
    }
  });
});

describe('coachingFor', () => {
  it('passes through real cues', () => {
    const coaching = coachingFor({
      instructions: ['Set the bar over mid-foot.', 'Brace, then descend.'],
      common_mistakes: ['Knees caving in.'],
      rom_notes: 'Hips below the knee crease.',
    });

    expect(coaching.instructions).toHaveLength(2);
    expect(coaching.commonMistakes).toEqual(['Knees caving in.']);
    expect(coaching.romNotes).toBe('Hips below the knee crease.');
    expect(coaching.hasAnything).toBe(true);
  });

  it('drops blanks that would render as empty bullets', () => {
    const coaching = coachingFor({
      instructions: ['Brace.', '', '   '],
      common_mistakes: [],
      rom_notes: '   ',
    });

    expect(coaching.instructions).toEqual(['Brace.']);
    expect(coaching.commonMistakes).toEqual([]);
    expect(coaching.romNotes).toBeNull();
  });

  it('trims surrounding whitespace', () => {
    expect(coachingFor({ instructions: ['  Brace.  '] }).instructions).toEqual(['Brace.']);
  });

  it('reports an exercise with nothing written for it', () => {
    expect(coachingFor({}).hasAnything).toBe(false);
    expect(coachingFor({ instructions: [], common_mistakes: [], rom_notes: null }).hasAnything).toBe(
      false,
    );
    expect(coachingFor({ instructions: ['', ''] }).hasAnything).toBe(false);
  });

  it('counts rom notes alone as something worth showing', () => {
    expect(coachingFor({ rom_notes: 'Full hang at the bottom.' }).hasAnything).toBe(true);
  });

  it('handles nulls from the database without throwing', () => {
    expect(coachingFor({ instructions: null, common_mistakes: null, rom_notes: null })).toEqual({
      instructions: [],
      commonMistakes: [],
      romNotes: null,
      hasAnything: false,
    });
  });
});
