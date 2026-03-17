# iOS Build & Submit

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

Before each new submission, bump `buildNumber` in `app.json`:

```json
"ios": {
  "buildNumber": "2"
}
```

App Store Connect rejects duplicate build numbers.

## Requirements

- Xcode installed (for local builds)
- CocoaPods (`sudo gem install cocoapods`)
- EAS CLI (`npm install -g eas-cli`)
- Apple Developer account linked (`eas login`)
- App created on [App Store Connect](https://appstoreconnect.apple.com) with bundle ID `com.trakio.mobile`
