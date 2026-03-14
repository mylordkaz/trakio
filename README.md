# trakio - Motorsport Lap Timer

A mobile app that records GPS telemetry during motorsport track sessions, automatically detects laps and sector splits, and displays driving lines on a satellite map. Built for track-day drivers, amateur racers, and driver coaches.

Designed to work fully offline — most race tracks have limited network coverage.

## Features

- **Predefined Track Database** — circuits with start/finish lines and sector markers stored locally
- **GPS Telemetry Recording** — continuous capture of location, speed, timestamp, and accuracy at 1-5 Hz
- **Automatic Lap Detection** — detects start/finish line crossings with debounce and minimum lap time safeguards
- **Sector Timing** — split times calculated as sector lines are crossed
- **Live Session Display** — current lap timer, last lap, best lap, sector splits, and lap count in a large, glanceable UI
- **Satellite Map Replay** — view lap paths over satellite imagery with optional speed-based coloring
- **Session History** — browse past sessions by track, date, best lap, and lap count
- **Local Storage** — all data stored on-device via SQLite

## Tech Stack

| Layer              | Technology                          |
| ------------------ | ----------------------------------- |
| Framework          | React Native (Expo SDK 54)          |
| Language           | TypeScript                          |
| Routing            | Expo Router (file-based)            |
| Database           | SQLite                              |
| Maps               | TBD (Mapbox or react-native-maps)   |
| State Management   | TBD (Zustand or Redux Toolkit)      |
| Location Services  | Native iOS / Android location APIs  |

## Data Model

```
Track       -> has many Sessions
Session     -> has many Laps
Lap         -> has many GPS Points, Sector Times
GPS Point   -> latitude, longitude, timestamp, speed, accuracy
```

## Getting Started

### Prerequisites

- Node.js
- Expo CLI (`npm install -g expo-cli`)
- iOS Simulator, Android Emulator, or [Expo Go](https://expo.dev/go)

### Install & Run

```bash
npm install
npx expo start
```

Then open the app on your preferred platform from the Expo dev tools.

## Project Structure

```
app/            # Screens and routing (file-based via Expo Router)
components/     # Reusable UI components
constants/      # App-wide constants
hooks/          # Custom React hooks
assets/         # Images, fonts, and static files
docs/           # Product proposal, MVP spec, and design mockups
scripts/        # Utility scripts
```

## MVP Scope

The MVP delivers a working app that can:

1. Select a predefined track
2. Start and record a session with GPS telemetry
3. Automatically detect laps via start/finish line crossing
4. Calculate sector split times
5. Save all session data locally
6. Replay laps on a satellite map

### Excluded from MVP

Delta timing comparisons, optimal lap calculation, external GPS receivers, video overlays, cloud sync, and social sharing.

## Future Roadmap

- Lap comparison tools
- Predictive lap timing
- External GPS receiver support
- Video overlays
- Cloud synchronization
- Community track sharing

## License

Private project.
