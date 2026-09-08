import { getTrackSearchText, localizeTrack } from '@/utils/track-localization';

type SearchableTrack = {
  id: string;
  name: string;
  country: string | null;
  location: string | null;
  layoutName: string | null;
};

// Katakana block (ァ..ヶ) sits 0x60 above its hiragana equivalents.
const KATAKANA_TO_HIRAGANA_OFFSET = 0x60;
const KATAKANA_START = 0x30a1;
const KATAKANA_END = 0x30f6;

/**
 * Canonical form both queries and track text are matched in: NFKC (folds
 * half-width kana and full-width Latin), lowercase, katakana folded to
 * hiragana so either script matches, and Latin combining accents stripped.
 * Kana voicing marks (U+3099/U+309A) sit outside U+0300–U+036F, so だ/た stay
 * distinct.
 */
export function normalizeForSearch(text: string, locale: string): string {
  const folded = Array.from(text.normalize('NFKC').toLocaleLowerCase(locale))
    .map((character) => {
      const code = character.codePointAt(0) ?? 0;

      return code >= KATAKANA_START && code <= KATAKANA_END
        ? String.fromCodePoint(code - KATAKANA_TO_HIRAGANA_OFFSET)
        : character;
    })
    .join('');

  return folded.normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC');
}

function tokenize(query: string, locale: string): string[] {
  return normalizeForSearch(query, locale)
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

// Lower ties rank higher.
const RANK_NAME_PREFIX = 0;
const RANK_NAME_SUBSTRING = 1;
const RANK_NAME_TOKENS = 2;
const RANK_ANY_FIELD = 3;

function rankTrack(
  track: SearchableTrack,
  tokens: string[],
  wholeQuery: string,
  blob: string,
  locale: string,
): number | null {
  if (!tokens.every((token) => blob.includes(token))) {
    return null;
  }

  const names = [track.name, localizeTrack(track, locale).name].map((name) =>
    normalizeForSearch(name, locale),
  );

  if (names.some((name) => name.startsWith(wholeQuery))) {
    return RANK_NAME_PREFIX;
  }
  if (names.some((name) => name.includes(wholeQuery))) {
    return RANK_NAME_SUBSTRING;
  }
  if (tokens.every((token) => names.some((name) => name.includes(token)))) {
    return RANK_NAME_TOKENS;
  }

  return RANK_ANY_FIELD;
}

/**
 * Filters to tracks matching every query token and orders them best-first:
 * name prefix, then name substring, then all tokens in the name, then matches
 * anywhere (country, location, layout). Ties keep their incoming order, so the
 * caller's sort (alphabetical, recency, distance) is the tiebreaker.
 */
export function filterAndRankTracks<T extends SearchableTrack>(
  tracks: T[],
  query: string,
  locale: string,
): T[] {
  const tokens = tokenize(query, locale);

  if (tokens.length === 0) {
    return tracks;
  }

  const wholeQuery = tokens.join(' ');

  return tracks
    .map((track, index) => ({
      track,
      index,
      rank: rankTrack(
        track,
        tokens,
        wholeQuery,
        normalizeForSearch(getTrackSearchText(track, locale), locale),
        locale,
      ),
    }))
    .filter((entry): entry is typeof entry & { rank: number } => entry.rank !== null)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.track);
}
