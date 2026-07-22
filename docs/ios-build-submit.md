# iOS Build & Submit

## One-Time EAS Environment Setup

`.env` files are gitignored and `eas.json` defines no env blocks, so EAS
builders only see variables registered with EAS itself. Production iOS builds
fail config evaluation without the grandfather allowlist. Before the first
production build, audit every released build number in App Store Connect and
register the allowlist:

```bash
eas env:create --scope project \
  --name EXPO_PUBLIC_GRANDFATHERED_IOS_BUILDS \
  --value "1,2,…,55" \
  --environment production
```

(Or add it under Project → Environment Variables in the EAS dashboard.) Update
the value only if another free build ships before the first monetized release.
Development and preview profiles must NOT define it.

## Local Build

```bash
eas build --platform ios --profile production --local
```

Outputs a `.ipa` file in the project root.

## Submit to App Store Connect

```bash
eas submit --platform ios --path ./path-to-your.ipa
```

## Build + Auto Submit (Cloud)

```bash
eas build --platform ios --profile production --auto-submit
```

## Increment Build Number

EAS currently manages the actual build number remotely. Before each new
submission, inspect the current remote value:

```bash
eas build:version:get --platform ios --profile production
```

Set the next value in `app.json` and in Xcode's
`CURRENT_PROJECT_VERSION`. For example, after remote build 55:

```json
"ios": {
  "buildNumber": "56"
}
```

The production config rejects an expected build number that appears in
`EXPO_PUBLIC_GRANDFATHERED_IOS_BUILDS`. After EAS creates the IPA, the
`eas-build-on-success` hook verifies the artifact's real `CFBundleVersion`
matches `app.json` and is not grandfathered. App Store Connect also rejects
duplicate build numbers.

## Requirements

- Xcode installed (for local builds)
- CocoaPods (`sudo gem install cocoapods`)
- EAS CLI (`npm install -g eas-cli`)
- Apple Developer account linked (`eas login`)
- App created on [App Store Connect](https://appstoreconnect.apple.com) with bundle ID `com.trakio.mobile`
