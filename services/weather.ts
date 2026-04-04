const CACHE_TTL_MS = 15 * 60 * 1000;

type WeatherCacheEntry = {
  weather: TrackWeather;
  fetchedAt: number;
};

const weatherCache = new Map<string, WeatherCacheEntry>();

export type TrackWeather = {
  temperatureC: number | null;
  windSpeedKph: number | null;
  windDirectionDeg: number | null;
  windDirectionCardinal: string | null;
  conditionKey: 'clear' | 'cloudy' | 'rain' | 'fog' | 'snow' | 'storm' | 'unknown';
  emoji: string;
};

type OpenMeteoCurrentWeatherResponse = {
  current?: {
    temperature_2m?: number;
    weather_code?: number;
    wind_speed_10m?: number;
    wind_direction_10m?: number;
  };
};

function toCardinalDirection(degrees: number | null): string | null {
  if (degrees === null || !Number.isFinite(degrees)) {
    return null;
  }

  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const normalizedDegrees = ((degrees % 360) + 360) % 360;
  const index = Math.round(normalizedDegrees / 45) % directions.length;

  return directions[index];
}

function mapWeatherCode(weatherCode: number | null): Pick<TrackWeather, 'conditionKey' | 'emoji'> {
  if (weatherCode === null) {
    return { conditionKey: 'unknown', emoji: '—' };
  }

  if (weatherCode === 0) {
    return { conditionKey: 'clear', emoji: '☀️' };
  }

  if ([1, 2, 3].includes(weatherCode)) {
    return { conditionKey: 'cloudy', emoji: '⛅️' };
  }

  if ([45, 48].includes(weatherCode)) {
    return { conditionKey: 'fog', emoji: '🌫️' };
  }

  if (
    (weatherCode >= 51 && weatherCode <= 67) ||
    (weatherCode >= 80 && weatherCode <= 82)
  ) {
    return { conditionKey: 'rain', emoji: '🌧️' };
  }

  if ((weatherCode >= 71 && weatherCode <= 77) || (weatherCode >= 85 && weatherCode <= 86)) {
    return { conditionKey: 'snow', emoji: '❄️' };
  }

  if (weatherCode >= 95 && weatherCode <= 99) {
    return { conditionKey: 'storm', emoji: '⛈️' };
  }

  return { conditionKey: 'cloudy', emoji: '☁️' };
}

export async function fetchTrackWeather(
  latitude: number,
  longitude: number
): Promise<TrackWeather> {
  const cacheKey = `${latitude},${longitude}`;
  const cached = weatherCache.get(cacheKey);

  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.weather;
  }

  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(latitude));
  url.searchParams.set('longitude', String(longitude));
  url.searchParams.set(
    'current',
    'temperature_2m,weather_code,wind_speed_10m,wind_direction_10m'
  );
  url.searchParams.set('wind_speed_unit', 'kmh');

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error('Unable to fetch weather data.');
  }

  const data = (await response.json()) as OpenMeteoCurrentWeatherResponse;
  const current = data.current;
  const weatherCode =
    typeof current?.weather_code === 'number' && Number.isFinite(current.weather_code)
      ? current.weather_code
      : null;
  const mappedWeather = mapWeatherCode(weatherCode);
  const windDirectionDeg =
    typeof current?.wind_direction_10m === 'number' && Number.isFinite(current.wind_direction_10m)
      ? current.wind_direction_10m
      : null;

  const weather: TrackWeather = {
    temperatureC:
      typeof current?.temperature_2m === 'number' && Number.isFinite(current.temperature_2m)
        ? current.temperature_2m
        : null,
    windSpeedKph:
      typeof current?.wind_speed_10m === 'number' && Number.isFinite(current.wind_speed_10m)
        ? current.wind_speed_10m
        : null,
    windDirectionDeg,
    windDirectionCardinal: toCardinalDirection(windDirectionDeg),
    conditionKey: mappedWeather.conditionKey,
    emoji: mappedWeather.emoji,
  };

  weatherCache.set(cacheKey, { weather, fetchedAt: Date.now() });

  return weather;
}
