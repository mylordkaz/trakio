const APP_STORE_ID = '6760278416';
const APP_STORE_PAGE_URL = `https://apps.apple.com/app/id${APP_STORE_ID}`;
const UPDATE_POLICY_URL =
  'https://raw.githubusercontent.com/mylordkaz/trakio/main/config/app-update-policy.json';

type Fetcher = typeof fetch;

type AppStoreLookupResult = {
  version?: unknown;
  releaseNotes?: unknown;
  trackViewUrl?: unknown;
};

type AppStoreLookupResponse = {
  results?: unknown;
};

type UpdatePolicyResponse = {
  ios?: {
    minimumSupportedVersion?: unknown;
  };
};

export type AppUpdate = {
  latestVersion: string;
  mandatory: boolean;
  releaseNotes: string | null;
  storeUrl: string;
};

function parseVersion(version: string): number[] | null {
  const normalized = version.trim();
  if (!/^\d+(?:\.\d+)*$/.test(normalized)) {
    return null;
  }

  return normalized.split('.').map(Number);
}

export function compareVersions(left: string, right: string): number | null {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  if (!leftParts || !rightParts) {
    return null;
  }

  const partCount = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < partCount; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;

    if (leftPart > rightPart) {
      return 1;
    }
    if (leftPart < rightPart) {
      return -1;
    }
  }

  return 0;
}

function normalizeLocale(locale: string): { country: string; language: string } {
  const parts = locale.replace('_', '-').split('-');
  const languageCode = parts[0]?.toLowerCase() === 'ja' ? 'ja' : 'en';
  const regionCode = parts.find((part) => /^[a-z]{2}$/i.test(part) && part !== parts[0]);

  return {
    country: regionCode?.toLowerCase() ?? (languageCode === 'ja' ? 'jp' : 'us'),
    language: languageCode === 'ja' ? 'ja_jp' : 'en_us',
  };
}

function isSafeStoreUrl(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    (value.startsWith('https://apps.apple.com/') ||
      value.startsWith('https://itunes.apple.com/'))
  );
}

function normalizeReleaseNotes(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const notes = value.trim();
  return notes ? notes.slice(0, 1000) : null;
}

async function fetchAppStoreRelease(
  locale: string,
  fetcher: Fetcher,
): Promise<AppStoreLookupResult | null> {
  const { country, language } = normalizeLocale(locale);
  const response = await fetcher(
    `https://itunes.apple.com/lookup?id=${APP_STORE_ID}&country=${country}&lang=${language}`,
  );

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as AppStoreLookupResponse;
  if (!Array.isArray(payload.results)) {
    return null;
  }

  const result = payload.results[0];
  return result && typeof result === 'object'
    ? (result as AppStoreLookupResult)
    : null;
}

async function fetchMinimumSupportedVersion(fetcher: Fetcher): Promise<string | null> {
  try {
    const response = await fetcher(`${UPDATE_POLICY_URL}?t=${Date.now()}`, {
      cache: 'no-store',
    });
    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as UpdatePolicyResponse;
    const minimumVersion = payload.ios?.minimumSupportedVersion;
    return typeof minimumVersion === 'string' && parseVersion(minimumVersion)
      ? minimumVersion.trim()
      : null;
  } catch {
    return null;
  }
}

export async function checkForAppUpdate({
  installedVersion,
  locale,
  fetcher = fetch,
}: {
  installedVersion: string;
  locale: string;
  fetcher?: Fetcher;
}): Promise<AppUpdate | null> {
  if (!parseVersion(installedVersion)) {
    return null;
  }

  const [storeRelease, minimumSupportedVersion] = await Promise.all([
    fetchAppStoreRelease(locale, fetcher),
    fetchMinimumSupportedVersion(fetcher),
  ]);

  const latestVersion =
    typeof storeRelease?.version === 'string' ? storeRelease.version.trim() : '';
  const latestComparison = compareVersions(latestVersion, installedVersion);
  if (latestComparison !== 1) {
    return null;
  }

  const installedToMinimum = minimumSupportedVersion
    ? compareVersions(installedVersion, minimumSupportedVersion)
    : null;
  const minimumToStore = minimumSupportedVersion
    ? compareVersions(minimumSupportedVersion, latestVersion)
    : null;

  return {
    latestVersion,
    mandatory: installedToMinimum === -1 && minimumToStore !== 1,
    releaseNotes: normalizeReleaseNotes(storeRelease?.releaseNotes),
    storeUrl: isSafeStoreUrl(storeRelease?.trackViewUrl)
      ? storeRelease.trackViewUrl
      : APP_STORE_PAGE_URL,
  };
}
