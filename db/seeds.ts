import type { TrackDirection, TimingLineType } from "@/db/types";

type NullableCoordinate = {
  latitude: number | null;
  longitude: number | null;
};

export type TrackSeed = {
  track: {
    id: string;
    slug: string;
    name: string;
    country: string | null;
    location: string | null;
    layoutName: string | null;
    lengthMeters: number | null;
    corners: number | null;
    direction: TrackDirection | null;
    centerLatitude: number | null;
    centerLongitude: number | null;
  };
  timingLines: {
    id: string;
    trackId: string;
    name: string;
    type: TimingLineType;
    seq: number;
    a: NullableCoordinate;
    b: NullableCoordinate;
  }[];
};

// Draft seed template. Replace all placeholder values before inserting into SQLite.
export const TRACK_SEED_DRAFTS: TrackSeed[] = [
  {
    track: {
      id: "tsukuba2000",
      slug: "tsukuba-2000",
      name: "Tsukuba 2000",
      location: "Tsukuba",
      country: "Japan",
      layoutName: "TS2000",
      lengthMeters: 2045,
      corners: 12,
      direction: "clockwise",
      centerLatitude: 36.15084268535904,
      centerLongitude: 139.9210083740979,
    },
    timingLines: [
      {
        id: "tsukuba2000:start-finish",
        trackId: "tsukuba2000",
        name: "Start/Finish",
        type: "start_finish",
        seq: 0,
        a: { latitude: 36.150175, longitude: 139.919393 },
        b: { latitude: 36.150129, longitude: 139.91966 },
      },
      {
        id: "tsukuba2000:sector-1",
        trackId: "tsukuba2000",
        name: "Sector 1",
        type: "sector",
        seq: 1,
        a: { latitude: 36.149986, longitude: 139.920308 },
        b: { latitude: 36.149995, longitude: 139.920454 },
      },
      {
        id: "tsukuba2000:sector-2",
        trackId: "tsukuba2000",
        name: "Sector 2",
        type: "sector",
        seq: 2,
        a: { latitude: 36.149791, longitude: 139.920717 },
        b: { latitude: 36.149772, longitude: 139.92087 },
      },
      {
        id: "tsukuba2000:sector-3",
        trackId: "tsukuba2000",
        name: "Sector 3",
        type: "sector",
        seq: 3,
        a: { latitude: 36.150685, longitude: 139.921956 },
        b: { latitude: 36.150507, longitude: 139.92196 },
      },
      {
        id: "tsukuba2000:sector-4",
        trackId: "tsukuba2000",
        name: "Sector 4",
        type: "sector",
        seq: 4,
        a: { latitude: 36.150182, longitude: 139.922396 },
        b: { latitude: 36.150105, longitude: 139.922528 },
      },
    ],
  },
  {
    track: {
      id: "tsukuba1000",
      slug: "tsukuba-1000",
      name: "Tsukuba 1000",
      location: "Tsukuba",
      country: "Japan",
      layoutName: "TS1000",
      lengthMeters: 1039,
      corners: 11,
      direction: "clockwise",
      centerLatitude: 36.15069534823727,
      centerLongitude: 139.92409968952433,
    },
    timingLines: [
      {
        id: "tsukuba1000:start-finish",
        trackId: "tsukuba1000",
        name: "Start/Finish",
        type: "start_finish",
        seq: 0,
        a: { latitude: 36.15101812356104, longitude: 139.92475581281158 },
        b: { latitude: 36.150976973546804, longitude: 139.92495496682832 },
      },
      {
        id: "tsukuba1000:sector-1",
        trackId: "tsukuba1000",
        name: "Sector 1",
        type: "sector",
        seq: 1,
        a: { latitude: 36.15083826651595, longitude: 139.92393625313645 },
        b: { latitude: 36.15079765785643, longitude: 139.92410456174994 },
      },
      {
        id: "tsukuba1000:sector-2",
        trackId: "tsukuba1000",
        name: "Sector 2",
        type: "sector",
        seq: 2,
        a: { latitude: 36.1508519004561, longitude: 139.92431500959535 },
        b: { latitude: 36.15080587731491, longitude: 139.92447795379087 },
      },
    ],
  },
];
