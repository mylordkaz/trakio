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
  };
};
