# trakio - Motorsport Lap Timer

A native mobile app that records GPS telemetry during motorsport track sessions, automatically detects laps and sector splits, and displays driving lines on a satellite map. Built for track-day drivers, amateur racers, and driver coaches.

Designed to work fully offline — most race tracks have limited network coverage.

## Features

### Core Recording
- **Track Database** — predefined circuits with ordered timing lines stored locally
- **GPS Telemetry Recording** — continuous capture of location, speed, timestamp, and accuracy at ~5 Hz
- **Automatic Lap Detection** — start/finish line crossing detection with debounce and minimum lap time safeguards
- **Sector Timing** — split times calculated as sector lines are crossed
- **Live Session Display** — current lap timer, last lap, best lap, sector splits, and lap count in a large, glanceable UI
- **Pre-Session Setup** — checklist (GPS lock, battery, start/finish line), weather conditions, car selection

### Session Review
- **Session Library** — browse past sessions by track, date, best lap, and lap count
- **Lap Path Map** — display saved GPS traces over Google Maps satellite imagery
- **Session Analytics** — consistency score, theoretical best, lap delta trends, sector breakdowns
- **Session Notes** — per-session driver notes
- **Track Notes** — per-circuit driver notes

### Sharing
- **Instagram Stories** — four templates (dark, transparent, photo background, racing line)
- **Social Post Sharing** — 1080x1080 card shared via OS share sheet (X, Threads, LINE, etc.)
- **Save to Photos** — export share cards to photo library

### Leaderboard
- **Global Leaderboard** — per-track leaderboard hosted on Cloudflare Workers + D1
- **Share Best Time** — publish your best lap with username, car, and country

### Profile & Preferences
- **Driver Profile** — username, car, nationality, avatar
- **Localization** — English and Japanese (i18n-js)
- **Dark/Light Mode** — system-aware appearance

### Other
- **Weather** — Open-Meteo integration for current conditions at selected track
- **Feedback** — in-app email feedback form
- **App Store Review Prompt** — native review dialog after 3rd completed session
- **Legal** — in-app Terms of Use and Privacy Policy (EN/JP)

## Tech Stack

| Layer             | Technology                                  |
| ----------------- | ------------------------------------------- |
| Framework         | React Native 0.81 (Expo SDK 54)             |
| Language          | TypeScript                                  |
| Routing           | Expo Router (file-based, typed routes)       |
| Styling           | NativeWind (Tailwind CSS)                    |
| Database          | expo-sqlite with versioned migrations        |
| Maps              | react-native-maps (Google Maps provider)     |
| Location          | expo-location (BestForNavigation mode)       |
| Sharing           | react-native-share, react-native-view-shot   |
| i18n              | i18n-js + expo-localization                   |
| Backend           | Cloudflare Workers + D1 (leaderboard only)   |

## Data Model

```
Track        -> has many Timing Lines, Sessions, and Track Notes
Timing Line  -> start/finish, sector, speed trap, pit gate
Session      -> has many Laps, GPS Points, and Session Notes
Lap          -> has many GPS Points and Lap Sectors
GPS Point    -> latitude, longitude, timestamp, speed, accuracy, elapsed_ms
User         -> driver profile (username, car, nationality, avatar)
```

SQLite tables:

- `tracks` — name, country, location, layout, length, corners, direction, center point
- `timing_lines` — ordered gate segments with type, seq, and a/b endpoints
- `sessions` — track reference, status, best lap, top speed, car, weather condition/temperature
- `laps` — lap number, time, out-lap/invalid flags, max speed
- `lap_sectors` — sector index and split time per lap
- `gps_points` — full telemetry samples with lap linkage and elapsed time
- `track_notes` — per-track driver notes
- `session_notes` — per-session driver notes
- `users` — local driver profile

## Getting Started

### Prerequisites

- Node.js
- EAS CLI (`npm install -g eas-cli`)
- iOS Simulator or physical device

### Install & Run

```bash
npm install
npx expo start
```

## Project Structure

```
app/            # Screens and routing (Expo Router, file-based)
components/     # Reusable UI components (including share card templates)
constants/      # App-wide constants
contexts/       # React context providers (menu/preferences)
db/             # SQLite schema, migrations, queries, and provider
hooks/          # Custom React hooks
i18n/           # Localization (en, ja)
services/       # External service integrations (leaderboard, share, weather, etc.)
telemetry/      # GPS recording pipeline (location, filters, detection, session runtime)
utils/          # Formatting, analytics, racing line projection
assets/         # Images, fonts, and static files
docs/           # Product proposal, specs, and design references
```

## Future Roadmap

- Lap comparison tools
- Predictive lap timing
- Video overlays
- Cloud synchronization
- Monetization (Pro tier, track map packages)

## License

Private project.
