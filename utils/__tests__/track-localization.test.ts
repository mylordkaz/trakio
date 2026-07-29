import { TRACK_SEED_DRAFTS } from '@/db/seeds';
import {
  formatTrackDisplayLocation,
  getTrackDisplayName,
  getTrackSearchText,
  hasJapaneseTrackMetadata,
  localizeTrack,
} from '@/utils/track-localization';

const honjo = {
  id: 'honjo-circuit',
  name: 'Honjo circuit',
  country: 'Japan',
  location: 'Saitama',
  layoutName: 'normal',
};

describe('track localization', () => {
  it('uses verified Japanese display metadata without mutating canonical data', () => {
    const localized = localizeTrack(honjo, 'ja-JP');

    expect(localized).toEqual({
      ...honjo,
      name: '本庄サーキット',
      country: '日本',
      location: '埼玉県',
      layoutName: '通常コース',
    });
    expect(honjo.name).toBe('Honjo circuit');
  });

  it('uses the current official Japanese names for renamed or expanded labels', () => {
    expect(getTrackDisplayName('twin-ring-motegi', 'Twin Ring Motegi', 'ja'))
      .toBe('モビリティリゾートもてぎ');
    expect(getTrackDisplayName('narita-motorland', 'Narita MotorLand', 'ja'))
      .toBe('ナリタモーターランド');
    expect(getTrackDisplayName('nanporo-kartland', 'Nanporo Kartland', 'ja'))
      .toBe('南幌リバーサイドカートランド');
  });

  it('uses a compact SUGO layout label that fits status pills', () => {
    const localized = localizeTrack({
      id: 'sportsland-sugo',
      name: 'Sportsland SUGO',
      country: 'Japan',
      location: 'Miyagi',
      layoutName: 'racing course',
    }, 'ja');

    expect(localized.layoutName).toBe('レーシングコース');
  });

  it('keeps canonical metadata for English and unknown tracks', () => {
    expect(localizeTrack(honjo, 'en-US')).toBe(honjo);
    expect(getTrackDisplayName('unknown-track', 'Unknown Track', 'ja'))
      .toBe('Unknown Track');
  });

  it('formats Japanese location text and searches both Japanese and romaji', () => {
    expect(formatTrackDisplayLocation(honjo, 'ja')).toBe('埼玉県・日本');

    const searchText = getTrackSearchText(honjo, 'ja');
    expect(searchText).toContain('本庄サーキット');
    expect(searchText).toContain('honjo circuit');
  });

  it('has Japanese metadata for every bundled Japanese circuit', () => {
    const missing = TRACK_SEED_DRAFTS
      .filter(({ track }) => track.country === 'Japan')
      .map(({ track }) => track.id)
      .filter((trackId) => !hasJapaneseTrackMetadata(trackId));

    expect(missing).toEqual([]);
  });
});
