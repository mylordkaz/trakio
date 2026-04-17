# Motorsport Lap Timer App – Product Proposal

> **Status:** The core product described here is shipped and live. This document is kept as a historical reference for the original vision. See README.md for the current feature set.

## Overview
A mobile application that records GPS telemetry during motorsport track sessions, automatically computes lap and sector times, and visualizes driving lines over a satellite map. The product is designed primarily for track-day drivers and amateur racers. The application must function reliably without internet connectivity, as many race tracks have limited network coverage.

## Goals
- Provide accurate lap timing using smartphone GPS.
- Display driving lines on a satellite map for session review.
- Store sessions locally for offline access.
- Allow drivers to analyze laps and sector performance.

## Target Users
- Track-day drivers
- Amateur racers
- Driver coaches
- Motorsport enthusiasts

## Core Features
1. **Track Database**
   - Predefined circuits with ordered timing lines.
   - Track metadata such as name and location.

2. **GPS Telemetry Recording**
   - Continuous recording of location, timestamp, speed, and accuracy.
   - Sampling rate optimized for driving analysis.

3. **Lap Timing Engine**
   - Automatic lap detection via start/finish line crossing.
   - Sector split detection.
   - Protection against false lap triggers.

4. **Satellite Map Visualization**
   - Display circuit sessions over satellite imagery.
   - Draw lap path overlays.
   - Color lap segments based on speed differences.

5. **Session Analysis**
   - View lap times and sector splits.
   - Display saved lap paths on the map.
   - Identify fast and slow sections of the track.

6. **Local Session Storage**
   - Sessions saved on the device.
   - Users can reopen and review previous sessions.

7. **Data Export**
   - Export telemetry data for external analysis tools.

## Technical Architecture

Mobile Application (React Native)
- Map Layer (satellite tiles)
- GPS Telemetry Recorder
- Lap Timing Engine
- Local SQLite Database
- Session Analysis UI

## Technology Stack
- **Framework:** React Native with TypeScript (Expo SDK 54)
- **Map:** react-native-maps (Google Maps provider)
- **Database:** expo-sqlite
- **Location Services:** expo-location (BestForNavigation mode)
- **Styling:** NativeWind (Tailwind CSS)
- **i18n:** i18n-js + expo-localization

## Data Model

### Track
- id
- slug
- name
- country
- location
- center_lat
- center_lng

### Timing Line
- id
- track_id
- name
- type
- seq
- a_lat
- a_lng
- b_lat
- b_lng

### Session
- id
- track_id
- date
- laps[]


### Lap
- id
- session_id
- lap_time
- sector_times[]
- gps_points[]

### GPS Point
- latitude
- longitude
- timestamp
- speed
- accuracy

## Key Challenges
- Reliable lap detection with noisy GPS signals
- Accurate timing at high speeds
- Efficient storage of large telemetry datasets
- Ensuring smooth map rendering with long lap traces

## Future Expansion
- Lap comparison tools
- Predictive lap timing
- ~~External GPS receiver support~~ — shipped
- Video overlays
- Cloud synchronization
- ~~Community track sharing~~ — partially shipped (per-track leaderboard)
