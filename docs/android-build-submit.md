# Android build and Google Play release

This checklist is for the first Trakio Android release (`com.trakio.mobile`).

## 1. Configure Google Maps

1. In Google Cloud, enable **Maps SDK for Android**.
2. Create a dedicated Android API key.
3. Add `GOOGLE_MAPS_ANDROID_API_KEY` to the EAS `production` environment. Do not commit the value.
4. Restrict the key to Maps SDK for Android, package `com.trakio.mobile`, and the signing certificate SHA-1.

For the first upload, use the EAS upload-certificate SHA-1. After Play App Signing is enabled, also add the Play app-signing certificate SHA-1 shown under **Setup > App integrity**. A production Android build intentionally fails during config evaluation when the key is absent.

## 2. Create the first production AAB

The project uses EAS remote versioning and production auto-increment.

```sh
eas build --platform android --profile production
```

Allow EAS to create the Android upload keystore if one does not exist. Keep Play App Signing enabled and retain access to the EAS credentials. The production profile produces an Android App Bundle (`.aab`).

Upload the first AAB manually to **Internal testing**. After Play creates its app-signing certificate, finish the Maps key restriction and create a replacement AAB if the signing restriction changed.

## 3. Play Console configuration

- Create or verify the Play app with package `com.trakio.mobile`. The package name cannot be changed after the first upload.
- Create and activate the products in `docs/monetization.md`:
  - `com.trakio.mobile.pro.yearly`, including an active annual base plan and price.
  - `com.trakio.mobile.pro.lifetime`, as an active one-time product with a price.
- Add license testers and test new purchase, pending purchase, restore, cancellation, grace period, account hold, refund, and revocation behavior.
- Set the public privacy-policy URL after this branch is pushed:
  - `https://github.com/mylordkaz/trakio/blob/main/privacy-policy.md`
- Complete App access, Ads, Target audience, Content rating, Data safety, and User-generated content declarations.
- Add the store listing icon, feature graphic, phone screenshots, short description, and full description.

For personal developer accounts subject to Google's new-account testing rule, complete the required closed test before requesting production access.

## 4. Data safety working notes

Verify these entries against the deployed Worker and its Cloudflare/D1 logging and retention settings before submitting the form:

- Live GPS/session telemetry is stored locally unless the user explicitly exports or shares it.
- Weather requests send the selected track's coordinates to Open-Meteo, not the device's live GPS position.
- Optional leaderboard sharing sends track ID, username, country, car, lap time, timestamp, and a stable local publisher ID. The data is public by user action.
- Feedback sends name, message, publisher ID, app version, and locale.
- Circuit requests send circuit name, publisher ID, app version, and locale.
- Leaderboard reports/removal requests send the relevant entry details plus the reporter's publisher ID, app version, and locale.
- Apple or Google processes payment details; Trakio does not receive full card or bank information.
- No advertising or third-party analytics SDK is currently included.
- Network requests use HTTPS.

## 5. UGC moderation operation

The app requires Terms acceptance before every leaderboard upload. The full leaderboard provides report, local block, and owner removal-request actions.

Reports and removals arrive through the existing feedback endpoint with a first line of:

```text
[leaderboard-moderation-v1]
```

These messages must be monitored. Establish an operator process to review reports promptly and remove abusive or requested content from D1. The in-app controls do not replace that server-side moderation work.

## 6. Android device acceptance test

Run at least one internal build on a modern physical Android device and, where available, older supported versions:

- Google map tiles and track overlays.
- Foreground location prompts, recording, screen rotation, and app resume.
- Bluetooth scanning/connection with supported external GPS hardware.
- Avatar and story image selection without broad photo-library permission.
- Saving generated images, including Android 7-9 because legacy write permission behavior differs.
- Profile avatar change/removal.
- Leaderboard consent, report, block, and removal request.
- Pro purchase and restore flows.
- Instagram/general sharing, PDF export, CSV export, edge-to-edge layout, and Android back navigation.
- Play Console pre-launch report and 16 KB native-library compatibility checks on the uploaded AAB.
