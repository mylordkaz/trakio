type TrackDisplaySource = {
  id: string;
  name: string;
  country: string | null;
  location: string | null;
  layoutName: string | null;
};

type JapaneseTrackMetadata = {
  name: string;
  layoutName?: string;
};

const JAPANESE_TRACK_METADATA: Record<string, JapaneseTrackMetadata> = {
  tsukuba2000: {
    name: '筑波サーキット コース2000',
    layoutName: 'コース2000',
  },
  tsukuba1000: {
    name: '筑波サーキット コース1000',
    layoutName: 'コース1000',
  },
  'fuji-speedway': {
    name: '富士スピードウェイ',
    layoutName: 'レーシングコース',
  },
  'nikko-circuit': {
    name: '日光サーキット',
  },
  'mobara-twin-circuit-east': {
    name: '茂原ツインサーキット（東コース）',
    layoutName: '東コース',
  },
  'mobara-twin-circuit-west': {
    name: '茂原ツインサーキット（西コース）',
    layoutName: '西コース',
  },
  'sodegaura-forest-raceway': {
    name: '袖ヶ浦フォレスト・レースウェイ',
  },
  'twin-ring-motegi': {
    name: 'モビリティリゾートもてぎ',
    layoutName: 'ロードコース',
  },
  'sports-land-yamanashi': {
    name: 'スポーツランドやまなし',
  },
  'tokachi-speedway': {
    name: '十勝スピードウェイ',
    layoutName: 'グランプリコース',
  },
  'suzuka-circuit': {
    name: '鈴鹿サーキット',
    layoutName: 'フルコース',
  },
  'central-circuit': {
    name: 'セントラルサーキット',
  },
  'sportsland-sugo': {
    name: 'スポーツランドSUGO',
    layoutName: 'インターナショナルレーシングコース',
  },
  'okayama-international-circuit': {
    name: '岡山国際サーキット',
  },
  'honjo-circuit': {
    name: '本庄サーキット',
  },
  'narita-motorland': {
    name: 'ナリタモーターランド',
  },
  'nasu-motor-sport-land': {
    name: '那須モータースポーツランド',
  },
  'nanporo-kartland': {
    name: '南幌リバーサイドカートランド',
  },
};

const JAPANESE_COUNTRY_NAMES: Record<string, string> = {
  Japan: '日本',
  Taiwan: '台湾',
};

const JAPANESE_LOCATION_NAMES: Record<string, string> = {
  Tsukuba: '茨城県',
  Shizuoka: '静岡県',
  Tochigi: '栃木県',
  Chiba: '千葉県',
  Yamanashi: '山梨県',
  Hokkaido: '北海道',
  Mie: '三重県',
  Hyogo: '兵庫県',
  Miyagi: '宮城県',
  Okayama: '岡山県',
  Saitama: '埼玉県',
};

const JAPANESE_LAYOUT_NAMES: Record<string, string> = {
  TS2000: 'コース2000',
  TS1000: 'コース1000',
  'grand prix circuit': 'レーシングコース',
  new: '新コース',
  East: '東コース',
  West: '西コース',
  normal: '通常コース',
  'Road course': 'ロードコース',
  'Grand Prix course': 'グランプリコース',
  'full course': 'フルコース',
  'racing course': 'レーシングコース',
};

function isJapaneseLocale(locale: string): boolean {
  return locale.toLowerCase().split(/[-_]/)[0] === 'ja';
}

function localizeNullable(
  value: string | null,
  translations: Record<string, string>,
): string | null {
  return value === null ? null : translations[value] ?? value;
}

export function hasJapaneseTrackMetadata(trackId: string): boolean {
  return Object.hasOwn(JAPANESE_TRACK_METADATA, trackId);
}

export function getTrackDisplayName(
  trackId: string,
  fallbackName: string,
  locale: string,
): string {
  if (!isJapaneseLocale(locale)) {
    return fallbackName;
  }

  return JAPANESE_TRACK_METADATA[trackId]?.name ?? fallbackName;
}

export function localizeTrack<T extends TrackDisplaySource>(
  track: T,
  locale: string,
): T {
  if (!isJapaneseLocale(locale)) {
    return track;
  }

  const metadata = JAPANESE_TRACK_METADATA[track.id];

  return {
    ...track,
    name: metadata?.name ?? track.name,
    country: localizeNullable(track.country, JAPANESE_COUNTRY_NAMES),
    location: localizeNullable(track.location, JAPANESE_LOCATION_NAMES),
    layoutName:
      metadata?.layoutName ??
      localizeNullable(track.layoutName, JAPANESE_LAYOUT_NAMES),
  };
}

export function formatTrackDisplayLocation(
  track: TrackDisplaySource,
  locale: string,
): string {
  const localizedTrack = localizeTrack(track, locale);
  return [localizedTrack.location, localizedTrack.country]
    .filter((part): part is string => Boolean(part))
    .join(isJapaneseLocale(locale) ? '・' : ', ');
}

export function getTrackSearchText(
  track: TrackDisplaySource,
  locale: string,
): string {
  const localizedTrack = localizeTrack(track, locale);

  return [
    track.name,
    track.country,
    track.location,
    track.layoutName,
    localizedTrack.name,
    localizedTrack.country,
    localizedTrack.location,
    localizedTrack.layoutName,
  ]
    .filter((part): part is string => Boolean(part))
    .join(' ')
    .toLocaleLowerCase(locale);
}
