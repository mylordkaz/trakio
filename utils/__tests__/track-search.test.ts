import { filterAndRankTracks, normalizeForSearch } from '@/utils/trackSearch';

function track(id: string, name: string, extra: Partial<{
  country: string | null;
  location: string | null;
  layoutName: string | null;
}> = {}) {
  return {
    id,
    name,
    country: extra.country ?? null,
    location: extra.location ?? null,
    layoutName: extra.layoutName ?? null,
  };
}

describe('normalizeForSearch', () => {
  it('folds katakana to hiragana so either script matches', () => {
    expect(normalizeForSearch('ナリタ', 'ja')).toBe(normalizeForSearch('なりた', 'ja'));
  });

  it('folds half-width katakana via NFKC', () => {
    expect(normalizeForSearch('ﾅﾘﾀ', 'ja')).toBe(normalizeForSearch('なりた', 'ja'));
  });

  it('keeps voiced kana distinct', () => {
    expect(normalizeForSearch('た', 'ja')).not.toBe(normalizeForSearch('だ', 'ja'));
  });

  it('strips Latin diacritics', () => {
    expect(normalizeForSearch('Nürburgring', 'en')).toBe('nurburgring');
  });

  it('lowercases and folds full-width Latin', () => {
    expect(normalizeForSearch('ＴＳＵＫＵＢＡ', 'en')).toBe('tsukuba');
  });
});

describe('filterAndRankTracks', () => {
  const tsukuba2000 = track('tsukuba2000', 'Tsukuba 2000', {
    country: 'Japan',
    location: 'Tsukuba',
  });
  const tsukuba1000 = track('tsukuba1000', 'Tsukuba 1000', {
    country: 'Japan',
    location: 'Tsukuba',
  });
  const narita = track('narita-motorland', 'Narita Motorland', {
    country: 'Japan',
    location: 'Narita',
  });
  const nurburgring = track('nurburgring', 'Nürburgring Nordschleife', {
    country: 'Germany',
  });
  const fuji = track('fuji-speedway', 'Fuji speedway', {
    country: 'Japan',
    location: 'Shizuoka',
  });
  const all = [fuji, narita, nurburgring, tsukuba1000, tsukuba2000];

  it('returns the input untouched for an empty query', () => {
    expect(filterAndRankTracks(all, '   ', 'en')).toEqual(all);
  });

  it('requires every token, in any order', () => {
    expect(filterAndRankTracks(all, '1000 tsukuba', 'en')).toEqual([tsukuba1000]);
  });

  it('matches accented names from unaccented queries', () => {
    expect(filterAndRankTracks(all, 'nurburgring', 'en')).toEqual([nurburgring]);
  });

  it('matches the Japanese metadata name from hiragana input', () => {
    expect(filterAndRankTracks(all, 'なりた', 'ja')).toEqual([narita]);
  });

  it('ranks name prefixes above other-field matches', () => {
    // "tsu" appears in Fuji's name nowhere, but Tsukuba tracks match by
    // name prefix while Narita would only match if a field contained it.
    const result = filterAndRankTracks(all, 'tsukuba', 'en');

    expect(result.slice(0, 2)).toEqual([tsukuba1000, tsukuba2000]);
  });

  it('ranks a name hit above a location-only hit', () => {
    const machida = track('x1', 'Machida Circuit', { location: 'Tokyo' });
    const inChibaOnly = track('x2', 'Mobara East', { location: 'Chiba' });
    const result = filterAndRankTracks([inChibaOnly, machida], 'chi', 'en');

    // Both match, but only Machida's *name* contains the token, so it
    // ranks first despite coming later in the input.
    expect(result[0]).toEqual(machida);
    expect(result[1]).toEqual(inChibaOnly);
  });
});
