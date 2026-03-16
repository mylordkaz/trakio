export type Circuit = {
  name: string;
  country: string;
  length: string;
  corners: number;
  status: string;
};

export type Session = {
  name: string;
  track: string;
  date: string;
  time: string;
  bestLap: string;
  laps: number;
  status: string;
};

export type LapItem = {
  lap: number;
  time: string;
  delta: string;
  status: string;
};

export const CIRCUITS: Circuit[] = [
  { name: 'Fuji Speedway', country: 'Japan', length: '4.563 km', corners: 16, status: 'Recent' },
  { name: 'Suzuka Circuit', country: 'Japan', length: '5.807 km', corners: 18, status: 'Popular' },
  { name: 'Tsukuba Circuit', country: 'Japan', length: '2.045 km', corners: 8, status: 'Nearby' },
  { name: 'Mobility Resort Motegi', country: 'Japan', length: '4.801 km', corners: 14, status: 'Saved' },
  { name: 'Okayama International Circuit', country: 'Japan', length: '3.703 km', corners: 13, status: 'New' },
];

export const SESSIONS: Session[] = [
  { name: 'Track Day · Session 2', track: 'Fuji Speedway', date: 'Mar 10, 2026', time: '10:24 AM', bestLap: '1:48.771', laps: 12, status: 'Best' },
  { name: 'Practice Run', track: 'Suzuka Circuit', date: 'Mar 2, 2026', time: '2:18 PM', bestLap: '58.214', laps: 9, status: 'Recent' },
  { name: 'Morning Session', track: 'Tsukuba Circuit', date: 'Feb 21, 2026', time: '8:42 AM', bestLap: '1:03.998', laps: 15, status: 'Recent' },
  { name: 'Wet Practice', track: 'Mobility Resort Motegi', date: 'Feb 8, 2026', time: '11:06 AM', bestLap: '2:07.441', laps: 11, status: 'Best' },
  { name: 'Afternoon Session', track: 'Okayama International Circuit', date: 'Jan 29, 2026', time: '3:51 PM', bestLap: '1:56.320', laps: 10, status: 'Recent' },
];

export const LAP_DATA: LapItem[] = [
  { lap: 1, time: '1:54.238', delta: '+0.82', status: 'Warm-up' },
  { lap: 2, time: '1:49.914', delta: '-4.32', status: 'Push' },
  { lap: 3, time: '1:48.771', delta: '-1.14', status: 'Best Lap' },
  { lap: 4, time: '1:49.102', delta: '+0.33', status: 'Cool Down' },
];

export const SECTOR_HIGHLIGHTS = [
  { label: 'Best S1', time: '31.842' },
  { label: 'Best S2', time: '41.317' },
  { label: 'Best S3', time: '34.511' },
];
