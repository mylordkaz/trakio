import type { SessionStatus } from "@/db/types";

export type SessionTestSeed = {
  session: {
    id: string;
    name: string;
    userId?: string | null;
    trackId: string;
    startedAt: string;
    endedAt: string;
    status: SessionStatus;
    bestLapMs: number;
    totalLaps: number;
    maxSpeedKph: number;
  };
  laps: {
    id: string;
    lapNumber: number;
    startedAt: string;
    endedAt: string;
    lapTimeMs: number;
    isOutLap?: 0 | 1;
    isInvalid?: 0 | 1;
    maxSpeedKph?: number | null;
  }[];
  lapSectors: {
    id: string;
    lapId: string;
    sectorIndex: number;
    splitTimeMs: number;
  }[];
  gpsPoints: {
    id: string;
    lapId: string | null;
    recordedAt: string;
    elapsedMs?: number | null;
    latitude: number;
    longitude: number;
    speedMps?: number | null;
    accuracyM?: number | null;
    altitudeM?: number | null;
    headingDeg?: number | null;
    isTimingCrossing?: 0 | 1;
    source?: string | null;
    iTow?: number | null;
    timeAccuracyNs?: number | null;
    nanosecond?: number | null;
    gForceX?: number | null;
    gForceY?: number | null;
    gForceZ?: number | null;
    rotationRateX?: number | null;
    rotationRateY?: number | null;
    rotationRateZ?: number | null;
    verticalAccuracyM?: number | null;
    speedAccuracyMps?: number | null;
    headingAccuracyDeg?: number | null;
    pdop?: number | null;
    satelliteCount?: number | null;
    fixType?: number | null;
    fixFlags?: number | null;
    validityFlags?: number | null;
    dateTimeFlags?: number | null;
    latLonFlags?: number | null;
    batteryLevel?: number | null;
    isCharging?: 0 | 1 | null;
    inputVoltageV?: number | null;
  }[];
  notes: {
    id: string;
    note: string;
    seq: number;
  }[];
};

export const SESSION_TEST_SEEDS: SessionTestSeed[] = [
  {
    session: {
      id: "test-session-tsukuba2000-1",
      name: "DEMO・セッション1",
      trackId: "tsukuba2000",
      startedAt: "2026-03-14T08:30:00+09:00",
      endedAt: "2026-03-14T08:49:20+09:00",
      status: "completed",
      bestLapMs: 68071,
      totalLaps: 4,
      maxSpeedKph: 167.4,
    },
    laps: [
      {
        id: "test-lap-tsukuba2000-1-1",
        lapNumber: 1,
        startedAt: "2026-03-14T08:31:00+09:00",
        endedAt: "2026-03-14T08:32:11+09:00",
        lapTimeMs: 71184,
        maxSpeedKph: 160.9,
      },
      {
        id: "test-lap-tsukuba2000-1-2",
        lapNumber: 2,
        startedAt: "2026-03-14T08:32:11+09:00",
        endedAt: "2026-03-14T08:33:20+09:00",
        lapTimeMs: 69221,
        maxSpeedKph: 164.2,
      },
      {
        id: "test-lap-tsukuba2000-1-3",
        lapNumber: 3,
        startedAt: "2026-03-14T08:33:20+09:00",
        endedAt: "2026-03-14T08:34:28+09:00",
        lapTimeMs: 68071,
        maxSpeedKph: 167.4,
      },
      {
        id: "test-lap-tsukuba2000-1-4",
        lapNumber: 4,
        startedAt: "2026-03-14T08:34:28+09:00",
        endedAt: "2026-03-14T08:35:37+09:00",
        lapTimeMs: 68842,
        maxSpeedKph: 165.1,
      },
    ],
    lapSectors: [
      {
        id: "test-sector-tsukuba2000-1-1-0",
        lapId: "test-lap-tsukuba2000-1-1",
        sectorIndex: 0,
        splitTimeMs: 28235,
      },
      {
        id: "test-sector-tsukuba2000-1-1-1",
        lapId: "test-lap-tsukuba2000-1-1",
        sectorIndex: 1,
        splitTimeMs: 28771,
      },
      {
        id: "test-sector-tsukuba2000-1-1-2",
        lapId: "test-lap-tsukuba2000-1-1",
        sectorIndex: 2,
        splitTimeMs: 14178,
      },
      {
        id: "test-sector-tsukuba2000-1-2-0",
        lapId: "test-lap-tsukuba2000-1-2",
        sectorIndex: 0,
        splitTimeMs: 27693,
      },
      {
        id: "test-sector-tsukuba2000-1-2-1",
        lapId: "test-lap-tsukuba2000-1-2",
        sectorIndex: 1,
        splitTimeMs: 28234,
      },
      {
        id: "test-sector-tsukuba2000-1-2-2",
        lapId: "test-lap-tsukuba2000-1-2",
        sectorIndex: 2,
        splitTimeMs: 13294,
      },
      {
        id: "test-sector-tsukuba2000-1-3-0",
        lapId: "test-lap-tsukuba2000-1-3",
        sectorIndex: 0,
        splitTimeMs: 27305,
      },
      {
        id: "test-sector-tsukuba2000-1-3-1",
        lapId: "test-lap-tsukuba2000-1-3",
        sectorIndex: 1,
        splitTimeMs: 27879,
      },
      {
        id: "test-sector-tsukuba2000-1-3-2",
        lapId: "test-lap-tsukuba2000-1-3",
        sectorIndex: 2,
        splitTimeMs: 12887,
      },
      {
        id: "test-sector-tsukuba2000-1-4-0",
        lapId: "test-lap-tsukuba2000-1-4",
        sectorIndex: 0,
        splitTimeMs: 27530,
      },
      {
        id: "test-sector-tsukuba2000-1-4-1",
        lapId: "test-lap-tsukuba2000-1-4",
        sectorIndex: 1,
        splitTimeMs: 28111,
      },
      {
        id: "test-sector-tsukuba2000-1-4-2",
        lapId: "test-lap-tsukuba2000-1-4",
        sectorIndex: 2,
        splitTimeMs: 13201,
      },
    ],
    gpsPoints: [
      {
        id: "test-gps-tsukuba2000-1-1",
        lapId: null,
        recordedAt: "2026-03-13T23:33:20.000Z",
        latitude: 36.15023895708868,
        longitude: 139.91946714233788,
      },
      {
        id: "test-gps-tsukuba2000-1-2",
        lapId: null,
        recordedAt: "2026-03-13T23:33:20.782Z",
        latitude: 36.15054858532759,
        longitude: 139.9195644495559,
      },
      {
        id: "test-gps-tsukuba2000-1-3",
        lapId: null,
        recordedAt: "2026-03-13T23:33:21.564Z",
        latitude: 36.15087476089163,
        longitude: 139.91965627956273,
      },
      {
        id: "test-gps-tsukuba2000-1-4",
        lapId: null,
        recordedAt: "2026-03-13T23:33:22.347Z",
        latitude: 36.15118112291092,
        longitude: 139.91974308277167,
      },
      {
        id: "test-gps-tsukuba2000-1-5",
        lapId: null,
        recordedAt: "2026-03-13T23:33:23.129Z",
        latitude: 36.15145025830146,
        longitude: 139.919816249192,
      },
      {
        id: "test-gps-tsukuba2000-1-6",
        lapId: null,
        recordedAt: "2026-03-13T23:33:23.912Z",
        latitude: 36.15166321504825,
        longitude: 139.91987801011894,
      },
      {
        id: "test-gps-tsukuba2000-1-7",
        lapId: null,
        recordedAt: "2026-03-13T23:33:24.694Z",
        latitude: 36.15184106517634,
        longitude: 139.91994122969228,
      },
      {
        id: "test-gps-tsukuba2000-1-8",
        lapId: null,
        recordedAt: "2026-03-13T23:33:25.476Z",
        latitude: 36.151985889679715,
        longitude: 139.92001569064797,
      },
      {
        id: "test-gps-tsukuba2000-1-9",
        lapId: null,
        recordedAt: "2026-03-13T23:33:26.259Z",
        latitude: 36.15210433700779,
        longitude: 139.92012221628607,
      },
      {
        id: "test-gps-tsukuba2000-1-10",
        lapId: null,
        recordedAt: "2026-03-13T23:33:27.041Z",
        latitude: 36.15219304371791,
        longitude: 139.92024087384917,
      },
      {
        id: "test-gps-tsukuba2000-1-11",
        lapId: null,
        recordedAt: "2026-03-13T23:33:27.824Z",
        latitude: 36.15223189741544,
        longitude: 139.92039544724113,
      },
      {
        id: "test-gps-tsukuba2000-1-12",
        lapId: null,
        recordedAt: "2026-03-13T23:33:28.606Z",
        latitude: 36.15221036695205,
        longitude: 139.92056490991772,
      },
      {
        id: "test-gps-tsukuba2000-1-13",
        lapId: null,
        recordedAt: "2026-03-13T23:33:29.389Z",
        latitude: 36.15212025563538,
        longitude: 139.92071959984992,
      },
      {
        id: "test-gps-tsukuba2000-1-14",
        lapId: null,
        recordedAt: "2026-03-13T23:33:30.171Z",
        latitude: 36.15197563120282,
        longitude: 139.92082417738223,
      },
      {
        id: "test-gps-tsukuba2000-1-15",
        lapId: null,
        recordedAt: "2026-03-13T23:33:30.953Z",
        latitude: 36.15178627082928,
        longitude: 139.9208407897322,
      },
      {
        id: "test-gps-tsukuba2000-1-16",
        lapId: null,
        recordedAt: "2026-03-13T23:33:31.736Z",
        latitude: 36.15158869927632,
        longitude: 139.92078278035206,
      },
      {
        id: "test-gps-tsukuba2000-1-17",
        lapId: null,
        recordedAt: "2026-03-13T23:33:32.518Z",
        latitude: 36.15138722011691,
        longitude: 139.92066798287445,
      },
      {
        id: "test-gps-tsukuba2000-1-18",
        lapId: null,
        recordedAt: "2026-03-13T23:33:33.301Z",
        latitude: 36.151163859645344,
        longitude: 139.9205490621976,
      },
      {
        id: "test-gps-tsukuba2000-1-19",
        lapId: null,
        recordedAt: "2026-03-13T23:33:34.083Z",
        latitude: 36.150919699868865,
        longitude: 139.92043932005956,
      },
      {
        id: "test-gps-tsukuba2000-1-20",
        lapId: null,
        recordedAt: "2026-03-13T23:33:34.866Z",
        latitude: 36.15064422518793,
        longitude: 139.92034856637423,
      },
      {
        id: "test-gps-tsukuba2000-1-21",
        lapId: null,
        recordedAt: "2026-03-13T23:33:35.648Z",
        latitude: 36.15035493963418,
        longitude: 139.92031149692755,
      },
      {
        id: "test-gps-tsukuba2000-1-22",
        lapId: null,
        recordedAt: "2026-03-13T23:33:36.430Z",
        latitude: 36.15006659044479,
        longitude: 139.92033668511783,
      },
      {
        id: "test-gps-tsukuba2000-1-23",
        lapId: null,
        recordedAt: "2026-03-13T23:33:37.213Z",
        latitude: 36.149799988760535,
        longitude: 139.92034351509335,
      },
      {
        id: "test-gps-tsukuba2000-1-24",
        lapId: null,
        recordedAt: "2026-03-13T23:33:37.995Z",
        latitude: 36.14955454268647,
        longitude: 139.92026392087004,
      },
      {
        id: "test-gps-tsukuba2000-1-25",
        lapId: null,
        recordedAt: "2026-03-13T23:33:38.778Z",
        latitude: 36.14935740325256,
        longitude: 139.92015208651574,
      },
      {
        id: "test-gps-tsukuba2000-1-26",
        lapId: null,
        recordedAt: "2026-03-13T23:33:39.560Z",
        latitude: 36.14920681301999,
        longitude: 139.92008087457282,
      },
      {
        id: "test-gps-tsukuba2000-1-27",
        lapId: null,
        recordedAt: "2026-03-13T23:33:40.343Z",
        latitude: 36.14908018014099,
        longitude: 139.92009315798998,
      },
      {
        id: "test-gps-tsukuba2000-1-28",
        lapId: null,
        recordedAt: "2026-03-13T23:33:41.125Z",
        latitude: 36.148981794747634,
        longitude: 139.92019779274057,
      },
      {
        id: "test-gps-tsukuba2000-1-29",
        lapId: null,
        recordedAt: "2026-03-13T23:33:41.907Z",
        latitude: 36.148940609897444,
        longitude: 139.9203690029316,
      },
      {
        id: "test-gps-tsukuba2000-1-30",
        lapId: null,
        recordedAt: "2026-03-13T23:33:42.690Z",
        latitude: 36.148976822660615,
        longitude: 139.9205660927014,
      },
      {
        id: "test-gps-tsukuba2000-1-31",
        lapId: null,
        recordedAt: "2026-03-13T23:33:43.472Z",
        latitude: 36.14909730761532,
        longitude: 139.92071241253075,
      },
      {
        id: "test-gps-tsukuba2000-1-32",
        lapId: null,
        recordedAt: "2026-03-13T23:33:44.255Z",
        latitude: 36.149273703840926,
        longitude: 139.9207880131318,
      },
      {
        id: "test-gps-tsukuba2000-1-33",
        lapId: null,
        recordedAt: "2026-03-13T23:33:45.037Z",
        latitude: 36.14948438729708,
        longitude: 139.92078901127442,
      },
      {
        id: "test-gps-tsukuba2000-1-34",
        lapId: null,
        recordedAt: "2026-03-13T23:33:45.820Z",
        latitude: 36.14968193240921,
        longitude: 139.92079167344187,
      },
      {
        id: "test-gps-tsukuba2000-1-35",
        lapId: null,
        recordedAt: "2026-03-13T23:33:46.602Z",
        latitude: 36.149865865637054,
        longitude: 139.92080465330022,
      },
      {
        id: "test-gps-tsukuba2000-1-36",
        lapId: null,
        recordedAt: "2026-03-13T23:33:47.384Z",
        latitude: 36.15004084400912,
        longitude: 139.92082988588055,
      },
      {
        id: "test-gps-tsukuba2000-1-37",
        lapId: null,
        recordedAt: "2026-03-13T23:33:48.167Z",
        latitude: 36.15020320667031,
        longitude: 139.92085983328388,
      },
      {
        id: "test-gps-tsukuba2000-1-38",
        lapId: null,
        recordedAt: "2026-03-13T23:33:48.949Z",
        latitude: 36.150358711400806,
        longitude: 139.9209022873539,
      },
      {
        id: "test-gps-tsukuba2000-1-39",
        lapId: null,
        recordedAt: "2026-03-13T23:33:49.732Z",
        latitude: 36.15049630818846,
        longitude: 139.92100342968567,
      },
      {
        id: "test-gps-tsukuba2000-1-40",
        lapId: null,
        recordedAt: "2026-03-13T23:33:50.514Z",
        latitude: 36.15058932118721,
        longitude: 139.9211928693998,
      },
      {
        id: "test-gps-tsukuba2000-1-41",
        lapId: null,
        recordedAt: "2026-03-13T23:33:51.297Z",
        latitude: 36.15063999689618,
        longitude: 139.92143146656727,
      },
      {
        id: "test-gps-tsukuba2000-1-42",
        lapId: null,
        recordedAt: "2026-03-13T23:33:52.079Z",
        latitude: 36.1506366529075,
        longitude: 139.92170070032515,
      },
      {
        id: "test-gps-tsukuba2000-1-43",
        lapId: null,
        recordedAt: "2026-03-13T23:33:52.861Z",
        latitude: 36.15062320161224,
        longitude: 139.92197562997896,
      },
      {
        id: "test-gps-tsukuba2000-1-44",
        lapId: null,
        recordedAt: "2026-03-13T23:33:53.644Z",
        latitude: 36.15064271734442,
        longitude: 139.92225010559918,
      },
      {
        id: "test-gps-tsukuba2000-1-45",
        lapId: null,
        recordedAt: "2026-03-13T23:33:54.426Z",
        latitude: 36.150720840262196,
        longitude: 139.92251334160588,
      },
      {
        id: "test-gps-tsukuba2000-1-46",
        lapId: null,
        recordedAt: "2026-03-13T23:33:55.209Z",
        latitude: 36.15084887468489,
        longitude: 139.9227660034482,
      },
      {
        id: "test-gps-tsukuba2000-1-47",
        lapId: null,
        recordedAt: "2026-03-13T23:33:55.991Z",
        latitude: 36.151033047962414,
        longitude: 139.92299478503338,
      },
      {
        id: "test-gps-tsukuba2000-1-48",
        lapId: null,
        recordedAt: "2026-03-13T23:33:56.773Z",
        latitude: 36.1512540799785,
        longitude: 139.92319325868152,
      },
      {
        id: "test-gps-tsukuba2000-1-49",
        lapId: null,
        recordedAt: "2026-03-13T23:33:57.556Z",
        latitude: 36.15149756619636,
        longitude: 139.92336198083663,
      },
      {
        id: "test-gps-tsukuba2000-1-50",
        lapId: null,
        recordedAt: "2026-03-13T23:33:58.338Z",
        latitude: 36.15176671824346,
        longitude: 139.92349812490124,
      },
      {
        id: "test-gps-tsukuba2000-1-51",
        lapId: null,
        recordedAt: "2026-03-13T23:33:59.120Z",
        latitude: 36.152030808253855,
        longitude: 139.92360182283068,
      },
      {
        id: "test-gps-tsukuba2000-1-52",
        lapId: null,
        recordedAt: "2026-03-13T23:33:59.902Z",
        latitude: 36.152261274312494,
        longitude: 139.92366730408787,
      },
      {
        id: "test-gps-tsukuba2000-1-53",
        lapId: null,
        recordedAt: "2026-03-13T23:34:00.685Z",
        latitude: 36.15242697572062,
        longitude: 139.92373451536656,
      },
      {
        id: "test-gps-tsukuba2000-1-54",
        lapId: null,
        recordedAt: "2026-03-13T23:34:01.467Z",
        latitude: 36.152538641265004,
        longitude: 139.92383714308284,
      },
      {
        id: "test-gps-tsukuba2000-1-55",
        lapId: null,
        recordedAt: "2026-03-13T23:34:02.250Z",
        latitude: 36.15257670406398,
        longitude: 139.92399076972305,
      },
      {
        id: "test-gps-tsukuba2000-1-56",
        lapId: null,
        recordedAt: "2026-03-13T23:34:03.032Z",
        latitude: 36.15252613665485,
        longitude: 139.92416401513037,
      },
      {
        id: "test-gps-tsukuba2000-1-57",
        lapId: null,
        recordedAt: "2026-03-13T23:34:03.815Z",
        latitude: 36.152414943552955,
        longitude: 139.92428174781523,
      },
      {
        id: "test-gps-tsukuba2000-1-58",
        lapId: null,
        recordedAt: "2026-03-13T23:34:04.597Z",
        latitude: 36.15226660545136,
        longitude: 139.92428558423,
      },
      {
        id: "test-gps-tsukuba2000-1-59",
        lapId: null,
        recordedAt: "2026-03-13T23:34:05.379Z",
        latitude: 36.15210650554008,
        longitude: 139.9242597102935,
      },
      {
        id: "test-gps-tsukuba2000-1-60",
        lapId: null,
        recordedAt: "2026-03-13T23:34:06.162Z",
        latitude: 36.151943748813956,
        longitude: 139.9241443758038,
      },
      {
        id: "test-gps-tsukuba2000-1-61",
        lapId: null,
        recordedAt: "2026-03-13T23:34:06.944Z",
        latitude: 36.1517815380694,
        longitude: 139.92398882479273,
      },
      {
        id: "test-gps-tsukuba2000-1-62",
        lapId: null,
        recordedAt: "2026-03-13T23:34:07.727Z",
        latitude: 36.151612871325945,
        longitude: 139.92381759665616,
      },
      {
        id: "test-gps-tsukuba2000-1-63",
        lapId: null,
        recordedAt: "2026-03-13T23:34:08.509Z",
        latitude: 36.15144224817375,
        longitude: 139.9236607715385,
      },
      {
        id: "test-gps-tsukuba2000-1-64",
        lapId: null,
        recordedAt: "2026-03-13T23:34:09.292Z",
        latitude: 36.15125812214862,
        longitude: 139.9234936669145,
      },
      {
        id: "test-gps-tsukuba2000-1-65",
        lapId: null,
        recordedAt: "2026-03-13T23:34:10.074Z",
        latitude: 36.151066221168875,
        longitude: 139.92332024422544,
      },
      {
        id: "test-gps-tsukuba2000-1-66",
        lapId: null,
        recordedAt: "2026-03-13T23:34:10.856Z",
        latitude: 36.15086466065774,
        longitude: 139.92314063366922,
      },
      {
        id: "test-gps-tsukuba2000-1-67",
        lapId: null,
        recordedAt: "2026-03-13T23:34:11.639Z",
        latitude: 36.15065484858914,
        longitude: 139.9229538214533,
      },
      {
        id: "test-gps-tsukuba2000-1-68",
        lapId: null,
        recordedAt: "2026-03-13T23:34:12.421Z",
        latitude: 36.150437628675085,
        longitude: 139.92276353237975,
      },
      {
        id: "test-gps-tsukuba2000-1-69",
        lapId: null,
        recordedAt: "2026-03-13T23:34:13.204Z",
        latitude: 36.150223246750265,
        longitude: 139.92257349921067,
      },
      {
        id: "test-gps-tsukuba2000-1-70",
        lapId: null,
        recordedAt: "2026-03-13T23:34:13.986Z",
        latitude: 36.150007938111195,
        longitude: 139.92237866967457,
      },
      {
        id: "test-gps-tsukuba2000-1-71",
        lapId: null,
        recordedAt: "2026-03-13T23:34:14.768Z",
        latitude: 36.14978320139828,
        longitude: 139.92217466952857,
      },
      {
        id: "test-gps-tsukuba2000-1-72",
        lapId: null,
        recordedAt: "2026-03-13T23:34:15.551Z",
        latitude: 36.149547497447564,
        longitude: 139.9219616619745,
      },
      {
        id: "test-gps-tsukuba2000-1-73",
        lapId: null,
        recordedAt: "2026-03-13T23:34:16.333Z",
        latitude: 36.14930732796209,
        longitude: 139.92174857820433,
      },
      {
        id: "test-gps-tsukuba2000-1-74",
        lapId: null,
        recordedAt: "2026-03-13T23:34:17.116Z",
        latitude: 36.14906814478635,
        longitude: 139.92153519462101,
      },
      {
        id: "test-gps-tsukuba2000-1-75",
        lapId: null,
        recordedAt: "2026-03-13T23:34:17.898Z",
        latitude: 36.148839776684774,
        longitude: 139.92132518919095,
      },
      {
        id: "test-gps-tsukuba2000-1-76",
        lapId: null,
        recordedAt: "2026-03-13T23:34:18.681Z",
        latitude: 36.14865545332057,
        longitude: 139.92113247741094,
      },
      {
        id: "test-gps-tsukuba2000-1-77",
        lapId: null,
        recordedAt: "2026-03-13T23:34:19.463Z",
        latitude: 36.1485089759677,
        longitude: 139.92092251179642,
      },
      {
        id: "test-gps-tsukuba2000-1-78",
        lapId: null,
        recordedAt: "2026-03-13T23:34:20.245Z",
        latitude: 36.14841976640834,
        longitude: 139.92066750751414,
      },
      {
        id: "test-gps-tsukuba2000-1-79",
        lapId: null,
        recordedAt: "2026-03-13T23:34:21.028Z",
        latitude: 36.148384707971246,
        longitude: 139.92039028888658,
      },
      {
        id: "test-gps-tsukuba2000-1-80",
        lapId: null,
        recordedAt: "2026-03-13T23:34:21.810Z",
        latitude: 36.14840267569224,
        longitude: 139.92010504415808,
      },
      {
        id: "test-gps-tsukuba2000-1-81",
        lapId: null,
        recordedAt: "2026-03-13T23:34:22.593Z",
        latitude: 36.148477889671895,
        longitude: 139.91983178658307,
      },
      {
        id: "test-gps-tsukuba2000-1-82",
        lapId: null,
        recordedAt: "2026-03-13T23:34:23.375Z",
        latitude: 36.148621844728346,
        longitude: 139.9195990745217,
      },
      {
        id: "test-gps-tsukuba2000-1-83",
        lapId: null,
        recordedAt: "2026-03-13T23:34:24.158Z",
        latitude: 36.14880802447072,
        longitude: 139.91941961822837,
      },
      {
        id: "test-gps-tsukuba2000-1-84",
        lapId: null,
        recordedAt: "2026-03-13T23:34:24.940Z",
        latitude: 36.14901503166608,
        longitude: 139.91930122346153,
      },
      {
        id: "test-gps-tsukuba2000-1-85",
        lapId: null,
        recordedAt: "2026-03-13T23:34:25.722Z",
        latitude: 36.14924432145009,
        longitude: 139.91926223995412,
      },
      {
        id: "test-gps-tsukuba2000-1-86",
        lapId: null,
        recordedAt: "2026-03-13T23:34:26.505Z",
        latitude: 36.14948811440439,
        longitude: 139.91928504600872,
      },
      {
        id: "test-gps-tsukuba2000-1-87",
        lapId: null,
        recordedAt: "2026-03-13T23:34:27.288Z",
        latitude: 36.14974538046042,
        longitude: 139.9193377164967,
      },
      {
        id: "test-gps-tsukuba2000-1-88",
        lapId: null,
        recordedAt: "2026-03-13T23:34:28.071Z",
        latitude: 36.15001378416592,
        longitude: 139.91940253504853,
      },
    ],
    notes: [
      {
        id: "test-note-tsukuba2000-1-1",
        note: "序盤セクターはブレーキリリースがうまく決まった。",
        seq: 0,
      },
      {
        id: "test-note-tsukuba2000-1-2",
        note: "ベストラップは最終セクターの立ち上がりがきれいだった。",
        seq: 1,
      },
    ],
  },
];
