#!/usr/bin/env node

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');

function loadEnvFile(filename) {
  const filePath = path.join(projectRoot, filename);
  if (!fs.existsSync(filePath)) {
    return;
  }

  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    process.env[key] = line
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '');
  }
}

function findFirstFile(directory, predicate, maxDepth = 4) {
  if (!fs.existsSync(directory) || maxDepth < 0) {
    return null;
  }

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isFile() && predicate(entryPath)) {
      return entryPath;
    }
    if (entry.isDirectory()) {
      const match = findFirstFile(entryPath, predicate, maxDepth - 1);
      if (match) {
        return match;
      }
    }
  }

  return null;
}

function fail(message) {
  throw new Error(`iOS grandfathering build guard: ${message}`);
}

if (process.env.EAS_BUILD_PLATFORM && process.env.EAS_BUILD_PLATFORM !== 'ios') {
  process.exit(0);
}

// The grandfather allowlist is a production-only requirement; development and
// preview profiles intentionally build without it.
if (process.env.EAS_BUILD_PROFILE && process.env.EAS_BUILD_PROFILE !== 'production') {
  process.exit(0);
}

loadEnvFile('.env.local');
loadEnvFile('.env');

const appConfig = require(path.join(projectRoot, 'app.json')).expo;
const expectedBuildNumber = String(appConfig.ios?.buildNumber ?? '').trim();
const eligibleBuilds = (process.env.EXPO_PUBLIC_GRANDFATHERED_IOS_BUILDS ?? '')
  .split(',')
  .map((build) => build.trim())
  .filter(Boolean);

if (!expectedBuildNumber) {
  fail('app.json must declare ios.buildNumber.');
}
if (eligibleBuilds.length === 0) {
  fail('EXPO_PUBLIC_GRANDFATHERED_IOS_BUILDS must not be empty.');
}
if (eligibleBuilds.includes(expectedBuildNumber)) {
  fail(`expected build ${expectedBuildNumber} appears in the grandfather allowlist.`);
}

const explicitArtifact = process.argv[2] ? path.resolve(process.argv[2]) : null;
const artifactPath =
  explicitArtifact ??
  (process.env.EAS_BUILD === 'true'
    ? findFirstFile(path.join(projectRoot, 'ios', 'build'), (file) => file.endsWith('.ipa')) ??
      findFirstFile(projectRoot, (file) => file.endsWith('.ipa'), 1)
    : null);

if (!artifactPath) {
  if (process.env.EAS_BUILD === 'true') {
    fail('the completed EAS build did not expose an IPA to validate.');
  }
  console.log(`iOS release configuration is valid for expected build ${expectedBuildNumber}.`);
  process.exit(0);
}

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'trakio-build-guard-'));
try {
  execFileSync('/usr/bin/unzip', ['-qq', artifactPath, '-d', temporaryDirectory]);
  const infoPlist = findFirstFile(
    path.join(temporaryDirectory, 'Payload'),
    (file) => file.endsWith('.app/Info.plist'),
  );
  if (!infoPlist) {
    fail(`could not find the application Info.plist in ${artifactPath}.`);
  }

  const actualBuildNumber = execFileSync(
    '/usr/bin/plutil',
    ['-extract', 'CFBundleVersion', 'raw', '-o', '-', infoPlist],
    { encoding: 'utf8' },
  ).trim();

  if (actualBuildNumber !== expectedBuildNumber) {
    fail(
      `artifact build ${actualBuildNumber} does not match app.json ios.buildNumber ${expectedBuildNumber}.`,
    );
  }
  if (eligibleBuilds.includes(actualBuildNumber)) {
    fail(`artifact build ${actualBuildNumber} appears in the grandfather allowlist.`);
  }

  console.log(`Validated iOS release build ${actualBuildNumber} against the grandfather allowlist.`);
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
