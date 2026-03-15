# Motorsport Lap Timer App – MVP Specification

## MVP Goal

Deliver a working mobile application capable of recording track sessions, detecting laps automatically, and displaying lap paths on a satellite map.

The MVP should be simple, reliable, and usable at real track days.

## Included Features

### 1. Predefined Track Support
The app ships with a small number of predefined circuits.

Each track includes:
- name
- start/finish line
- sector lines

Tracks are stored locally.

### 2. GPS Recording
During a session the app records GPS samples including:
- timestamp
- latitude
- longitude
- speed
- accuracy

Sampling rate: 1–5 Hz.

### 3. Automatic Lap Detection
The app detects laps when the car crosses the start/finish line.

Logic:
- detect when the GPS path segment intersects the timing line
- close the current lap
- start the next lap

Safeguards:
- minimum lap time threshold
- sector order validation
- debounce protection against duplicate crossings

### 4. Sector Timing
Sector lines divide the track into segments.

When the vehicle crosses a sector line:
- record the split time
- display sector time in the lap table

### 5. Live Session Screen
During driving the app displays:
- current lap timer
- last lap time
- best lap time
- sector splits
- lap count

The UI should be large and easy to read while driving.

### 6. Lap Map Replay
After the session users can view their laps on a map.

The map displays:
- satellite imagery
- lap path polyline
- sector markers

Optionally color segments by speed.

### 7. Session Storage
All session data is stored locally on the device.

Database tables:
- tracks
- sessions
- laps
- gps_points

Users can reopen previous sessions.

### 8. Session History
A simple list of past sessions including:
- track name
- date
- best lap
- number of laps

Selecting a session opens detailed results.

## Excluded from MVP
The following features are intentionally excluded to reduce development complexity:

- track edges
- centerline telemetry alignment
- delta timing comparisons
- optimal lap calculation
- external GPS receivers
- video overlays
- cloud synchronization
- social sharing

## MVP Success Criteria
The MVP is successful if the application can:

1. Select a track
2. Start a session
3. Record GPS telemetry
4. Detect laps automatically
5. Calculate sector splits
6. Save session data
7. Replay laps on a satellite map

If these functions work reliably, the application provides real value for track-day drivers and establishes a solid foundation for future features.
