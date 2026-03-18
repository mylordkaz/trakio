import * as Location from 'expo-location';
import type { LocationObject, LocationSubscription } from 'expo-location';
import type {
  LocationPermissionState,
  TelemetryElapsedMsResolver,
  TelemetrySample,
} from '@/telemetry/types';

export type StartLocationSubscriptionOptions = {
  resolveElapsedMs: TelemetryElapsedMsResolver;
  onSample: (sample: TelemetrySample) => void;
  onError?: (error: Error) => void;
  accuracy?: Location.LocationAccuracy;
  timeIntervalMs?: number;
  distanceIntervalM?: number;
};

function mapPermissionStatus(status: Location.PermissionStatus): LocationPermissionState {
  switch (status) {
    case Location.PermissionStatus.GRANTED:
      return 'granted';
    case Location.PermissionStatus.DENIED:
      return 'denied';
    default:
      return 'undetermined';
  }
}

function isFiniteCoordinate(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeHeading(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  if (value < 0 || value >= 360) {
    return null;
  }

  return value;
}

function normalizeLocationSample(
  location: LocationObject,
  resolveElapsedMs: TelemetryElapsedMsResolver
): TelemetrySample | null {
  const latitude = location.coords.latitude;
  const longitude = location.coords.longitude;

  if (!isFiniteCoordinate(latitude) || !isFiniteCoordinate(longitude)) {
    return null;
  }

  const recordedAt = typeof location.timestamp === 'number' && Number.isFinite(location.timestamp)
    ? location.timestamp
    : Date.now();

  return {
    recordedAt,
    elapsedMs: resolveElapsedMs(recordedAt),
    lat: latitude,
    lng: longitude,
    speedMps:
      typeof location.coords.speed === 'number' && Number.isFinite(location.coords.speed)
        ? location.coords.speed
        : null,
    accuracyM:
      typeof location.coords.accuracy === 'number' && Number.isFinite(location.coords.accuracy)
        ? location.coords.accuracy
        : null,
    headingDeg: normalizeHeading(location.coords.heading),
    altitudeM:
      typeof location.coords.altitude === 'number' && Number.isFinite(location.coords.altitude)
        ? location.coords.altitude
        : null,
    source: 'gps',
  };
}

export async function getForegroundLocationPermissionState(): Promise<LocationPermissionState> {
  const permission = await Location.getForegroundPermissionsAsync();
  return mapPermissionStatus(permission.status);
}

export async function requestForegroundLocationPermission(): Promise<LocationPermissionState> {
  const permission = await Location.requestForegroundPermissionsAsync();
  return mapPermissionStatus(permission.status);
}

export async function getCurrentLocationSample(
  resolveElapsedMs: TelemetryElapsedMsResolver = () => 0
): Promise<TelemetrySample | null> {
  const location = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.BestForNavigation,
    mayShowUserSettingsDialog: true,
  });

  return normalizeLocationSample(location, resolveElapsedMs);
}

export async function startLocationSubscription(
  options: StartLocationSubscriptionOptions
): Promise<LocationSubscription> {
  const {
    resolveElapsedMs,
    onSample,
    onError,
    accuracy = Location.Accuracy.BestForNavigation,
    timeIntervalMs = 200,
    distanceIntervalM = 0,
  } = options;

  return Location.watchPositionAsync(
    {
      accuracy,
      timeInterval: timeIntervalMs,
      distanceInterval: distanceIntervalM,
      mayShowUserSettingsDialog: true,
    },
    (location) => {
      try {
        const sample = normalizeLocationSample(location, resolveElapsedMs);

        if (!sample) {
          return;
        }

        onSample(sample);
      } catch (error) {
        if (error instanceof Error) {
          onError?.(error);
          return;
        }

        onError?.(new Error('Unknown location subscription error.'));
      }
    }
  );
}

export function stopLocationSubscription(subscription: LocationSubscription | null | undefined) {
  subscription?.remove();
}
