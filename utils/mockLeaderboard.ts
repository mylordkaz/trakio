// Shared mock leaderboard data. Replace with real API calls when backend is ready.

export type LeaderboardEntry = {
  rank: number;
  name: string;
  firstName: string;
  countryCode: string | null;
  car: string | null;
  lapTimeMs: number;
  isCurrentUser: boolean;
};

// 9 drivers faster than user, 5 slower → user at P10 out of 15
const FASTER_DRIVERS = [
  { name: 'Kenji Watanabe',  firstName: 'Kenji',   countryCode: 'JP', car: 'Honda NSX GT3' },
  { name: 'Lucas Bernard',   firstName: 'Lucas',   countryCode: 'FR', car: 'Ferrari 488 GT3' },
  { name: 'Marco Ferretti',  firstName: 'Marco',   countryCode: 'IT', car: 'Lamborghini Huracán' },
  { name: 'Ryo Tanaka',      firstName: 'Ryo',     countryCode: 'JP', car: 'Toyota GR Supra' },
  { name: 'Erik Brandt',     firstName: 'Erik',    countryCode: 'DE', car: 'Porsche 911 GT3' },
  { name: 'James Whitfield', firstName: 'James',   countryCode: 'GB', car: 'McLaren 720S GT3' },
  { name: 'Hiroshi Morita',  firstName: 'Hiroshi', countryCode: 'JP', car: 'Nissan GT-R NISMO' },
  { name: 'Carlos Reyes',    firstName: 'Carlos',  countryCode: 'ES', car: 'Audi R8 LMS' },
  { name: 'Thomas Müller',   firstName: 'Thomas',  countryCode: 'DE', car: 'BMW M4 GT3' },
];

const SLOWER_DRIVERS = [
  { name: 'Antoine Dubois',    firstName: 'Antoine', countryCode: 'FR', car: 'Renault Alpine A110' },
  { name: "Liam O'Brien",      firstName: 'Liam',    countryCode: 'GB', car: 'Porsche 911 GT3 R' },
  { name: 'Yuki Shimada',      firstName: 'Yuki',    countryCode: 'JP', car: 'Lexus RC F GT3' },
  { name: 'Nils Lindqvist',    firstName: 'Nils',    countryCode: 'SE', car: 'Aston Martin Vantage' },
  { name: 'Riku Hämäläinen',   firstName: 'Riku',    countryCode: 'FI', car: 'Mercedes AMG GT3' },
];

// Offsets in ms relative to the user's personal best
const FASTER_OFFSETS_MS = [4553, 3880, 3669, 3331, 2752, 2383, 1769, 1212, 781];
const SLOWER_OFFSETS_MS = [433, 1017, 1650, 2380, 3120];

// Fallback anchor when user has no personal best (realistic Le Mans-class time)
const ANCHOR_MS = 228000; // 3:48.000

export function buildLeaderboard(
  personalBestMs: number | null,
  username: string,
  countryCode: string | null,
  userCar: string | null,
): LeaderboardEntry[] {
  const anchor = personalBestMs ?? ANCHOR_MS;

  const entries: LeaderboardEntry[] = [
    ...FASTER_DRIVERS.map((d, i) => ({
      rank: 0,
      name: d.name,
      firstName: d.firstName,
      countryCode: d.countryCode,
      car: d.car,
      lapTimeMs: anchor - FASTER_OFFSETS_MS[i],
      isCurrentUser: false,
    })),
    ...SLOWER_DRIVERS.map((d, i) => ({
      rank: 0,
      name: d.name,
      firstName: d.firstName,
      countryCode: d.countryCode,
      car: d.car,
      lapTimeMs: anchor + SLOWER_OFFSETS_MS[i],
      isCurrentUser: false,
    })),
  ];

  if (personalBestMs !== null) {
    entries.push({
      rank: 0,
      name: username,
      firstName: username,
      countryCode,
      car: userCar,
      lapTimeMs: personalBestMs,
      isCurrentUser: true,
    });
  }

  entries.sort((a, b) => a.lapTimeMs - b.lapTimeMs);
  entries.forEach((e, i) => { e.rank = i + 1; });

  return entries;
}

export function flagEmoji(cc: string | null): string {
  if (!cc || cc.length !== 2) return '';
  return [...cc.toUpperCase()]
    .map(c => String.fromCodePoint(c.charCodeAt(0) + 0x1F1E6 - 0x41))
    .join('');
}

export function rankLabel(rank: number): string {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return String(rank);
}
