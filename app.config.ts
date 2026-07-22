import fs from "node:fs";
import path from "node:path";
import type { ExpoConfig } from "expo/config";

const staticConfig = require("./app.json").expo as ExpoConfig;

function loadEnvFile(filename: string) {
  const filePath = path.join(__dirname, filename);
  if (!fs.existsSync(filePath)) {
    return;
  }

  const contents = fs.readFileSync(filePath, "utf8");
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    const rawValue = line.slice(separatorIndex + 1).trim();
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

export default (): ExpoConfig => {
  const googleMapsApiKey = process.env.GOOGLE_MAPS_IOS_API_KEY;
  const grandfatheredIosBuilds = (
    process.env.EXPO_PUBLIC_GRANDFATHERED_IOS_BUILDS ?? ''
  )
    .split(',')
    .map((build) => build.trim())
    .filter(Boolean);
  const buildConfiguration = (
    process.env.CONFIGURATION ?? process.env.EXPO_XCODE_CONFIGURATION ?? ''
  ).toLowerCase();
  const isProductionBuild =
    process.env.EAS_BUILD_PROFILE === 'production' ||
    process.env.NODE_ENV === 'production' ||
    buildConfiguration === 'release';
  const isIosBuild = process.env.EAS_BUILD_PLATFORM !== 'android';
  const expectedIosBuildNumber = staticConfig.ios?.buildNumber?.trim() ?? '';
  const requestedForceGrandfathered = process.env.TRAKIO_FORCE_GRANDFATHERED === 'true';
  const requestedForceFree = process.env.TRAKIO_FORCE_FREE === 'true';
  const forceGrandfathered = !isProductionBuild && requestedForceGrandfathered;
  const forceFree = !isProductionBuild && requestedForceFree;
  const rawDataExportEnabled =
    !isProductionBuild && process.env.TRAKIO_RAW_DATA_EXPORT === 'true';

  if (isProductionBuild) {
    if (isIosBuild) {
      if (grandfatheredIosBuilds.length === 0) {
        throw new Error('EXPO_PUBLIC_GRANDFATHERED_IOS_BUILDS is required for production iOS builds.');
      }

      if (!expectedIosBuildNumber) {
        throw new Error('ios.buildNumber is required for production iOS builds.');
      }

      if (grandfatheredIosBuilds.includes(expectedIosBuildNumber)) {
        throw new Error(
          `Current iOS build ${expectedIosBuildNumber} must not appear in EXPO_PUBLIC_GRANDFATHERED_IOS_BUILDS.`,
        );
      }
    }

    if (requestedForceGrandfathered || requestedForceFree) {
      throw new Error('Monetization test overrides must not be enabled in production.');
    }
  }

  return {
    ...staticConfig,
    ios: {
      ...staticConfig.ios,
      config: googleMapsApiKey
        ? {
            ...staticConfig.ios?.config,
            googleMapsApiKey,
          }
        : staticConfig.ios?.config,
    },
    extra: {
      ...staticConfig.extra,
      monetization: {
        grandfatheredIosBuilds,
        forceGrandfathered,
        forceFree,
      },
      rawDataExportEnabled,
    },
  };
};
