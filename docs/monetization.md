# Trakio Pro Monetization

## Plans and Products

Free users can keep up to three recorded sessions. Bundled demo sessions do not
count toward the limit. Trakio Pro includes unlimited saved sessions plus PDF
and CSV lap-time exports.

Store product IDs (use the same IDs in App Store Connect and Play Console):

- Yearly auto-renewing subscription: `com.trakio.mobile.pro.yearly`
- Lifetime non-consumable: `com.trakio.mobile.pro.lifetime`

Prices are loaded from the App Store and are never hard-coded in the app. The
initial target prices are JPY 1,500 per year and JPY 4,500 lifetime.

## Purchase Architecture

The app uses Apple StoreKit 2 and Google Play Billing directly through the
open-source `expo-iap` native wrapper. There is no third-party purchase account,
API key, hosted purchase service, or service fee. StoreKit verifies Apple's
signed transactions locally; Android grants are read from Play Billing's active
purchase query and acknowledged after delivery.

Both iOS and Android support yearly and lifetime purchases. Early-user
grandfathering remains iOS-only and is guarded by `Platform.OS === 'ios'`.
Android never enters the grandfathering flow.

StoreKit operations require a development or release build; they do not work in
Expo Go. App Store products and their prices may also be unavailable in a plain
simulator build without a StoreKit test configuration.

Client-side StoreKit verification is appropriate for locally gated app features
and avoids a hosted dependency. It is less resistant to a modified or jailbroken
client than server-side transaction verification. Add an App Store Server API
backend only if fraud becomes material or purchases later unlock server-hosted
resources.

## Access States

The entitlement provider exposes four states:

- `pending`: early-user eligibility is unresolved; Pro gates remain closed
- `resolved_free`: the three-session limit and export gates apply
- `resolved_pro`: a current yearly, lifetime, or grandfathered grant is active
- `offline_grace`: a locally cached paid grant is being used offline

GPS recording never depends on a network request. Existing installations are
identified from the local database and grandfathered without contacting Apple,
before any StoreKit connection is attempted. While eligibility is otherwise
pending, the session quota is not enforced — recording stays available — but
exports, plan labels, and every other Pro surface use the Free-tier rules; an
unresolved check never grants Pro. The Pro screen still displays the normal
plan choices and restore action while this background check is unresolved.

For a yearly plan, the app caches Apple's signed subscription expiration and
allows seven additional offline days after that date. Apple Billing Grace Period
extends the signed expiration to `gracePeriodExpirationDate`, and access remains
available throughout that period even though OpenIAP's basic `isActive` flag may
already be false. Google Play does not expose subscription expiration through
BillingClient, so Android conservatively uses seven days from its last successful
active-purchase query. Launching offline does not extend either window.

Lifetime access remains locally valid without an age limit and is cleared only
by an observed revocation (a transaction carrying a revocation date). A query
that simply reports the lifetime purchase absent is inconclusive — signed-out
or freshly restored devices resolve empty without throwing — and leaves the
cache untouched. Yearly absence still clears, since its expiration bounds it.
StoreKit verification failures take the cached fallback path and never masquerade
as an absent purchase. Grandfathered access is permanent once resolved and stored.

## Early Users

Early-user eligibility is iOS-only. Two paths protect existing users:

1. Migration 1 writes a fresh-install marker before creating any application
   tables. Migration 17 uses that durable marker to identify upgrades, including
   a fresh first launch interrupted during migrations 1-16. Existing installations
   are immediately grandfathered, including offline devices and iOS 15 devices.
2. Fresh installations and reinstalls on iOS 16 or newer read Apple's verified
   `AppTransaction.originalAppVersion` and compare it with an exact allowlist of
   pre-monetization `CFBundleVersion` strings.

Do not use numeric or lexicographic `<=` comparisons. App Store build numbering
may not have been globally monotonic. Apple does not return the real production
original version in sandbox and Xcode environments. Development builds remain
pending unless an override is set. A fresh production-profile TestFlight or App
Review install resolves as free for that session so the paywall and quota can be
reviewed; this sandbox result is never persisted. Existing upgraded databases
remain grandfathered first.

A fresh or reinstalled app on iOS 15 cannot read `AppTransaction`, so a clean
database remains Free while the device runs iOS 15. This decision is not persisted:
after the device upgrades to iOS 16 or newer, Apple's verified original app version
can still recover legitimate early-user access. Existing users who update without
deleting the app remain grandfathered from the local database, including offline.

Before the first monetized release:

1. Export or inspect the complete App Store Connect build history.
2. Put every released pre-monetization `CFBundleVersion` in the exact allowlist.
3. Confirm the new monetized build number is not in that list.
4. Keep the archived list with the release record.

The runtime guard leaves grandfathering pending, with Pro access closed, if the
current production build's own number appears in the allowlist. That configuration
error requires a corrected app update and never persists a permanent decision.

## Configuration

The only required production monetization environment variable is:

```text
EXPO_PUBLIC_GRANDFATHERED_IOS_BUILDS=exact,comma,separated,builds
```

It must be registered as an EAS environment variable for the production
environment (see docs/ios-build-submit.md); `.env` files are gitignored and
never reach EAS builders. No purchase API key is required. Development-client
builds running with `__DEV__ === true` also support:

```text
TRAKIO_FORCE_GRANDFATHERED=true
TRAKIO_FORCE_FREE=true
TRAKIO_RAW_DATA_EXPORT=true
```

`TRAKIO_FORCE_FREE` makes it possible to inspect the free paywall on a simulator
whose existing database would otherwise be grandfathered. EAS preview,
TestFlight, and local Release archives compile with `__DEV__ === false`; do not
set entitlement overrides for them. Release config can reject those variables at
build time, and the runtime guard ignores them regardless. Preview and TestFlight
QA must exercise grandfathering through the database upgrade path. Release config
also rejects an empty grandfather allowlist. A missing runtime allowlist leaves
early-user access pending without granting Pro or persisting an ineligible
decision. Raw JSON export is disabled in release builds.

Foreground store refreshes are coalesced and limited to once every five
minutes. Product metadata is retained after it is loaded, and automatic refreshes
are skipped while the live recording route is active. Manual paywall retry and
restore actions still bypass the freshness interval. Entitlement queries are
generation-stamped so an older result cannot overwrite a purchase or a newer
store result. Lifecycle-triggered recovery refreshes bypass an older in-flight
query. Yearly caches also schedule checks at their store expiration and hard
offline deadline. Leaving the recording route forces any deferred store refresh.
Lifetime always wins when both products exist, including direct renewal events.

Production iOS builds declare the expected next `ios.buildNumber` in `app.json`.
Config evaluation fails if that number is in the grandfather allowlist, and the
`eas-build-on-success` hook extracts the completed IPA to verify its real
`CFBundleVersion` matches and is not allowlisted. Keep the EAS remote version,
`app.json`, and Xcode `CURRENT_PROJECT_VERSION` synchronized before every build.

Changing the IAP native dependency or config plugin requires a new development
build; restarting Metro is not enough.

## App Store Setup

In App Store Connect:

1. Create the yearly auto-renewing subscription and lifetime non-consumable with
   the exact product IDs above.
2. Put the yearly product in a subscription group.
3. Set price, availability, localization, review screenshot, and review notes for
   both products.
4. Leave Family Sharing and introductory offers disabled unless the product plan
   changes.
5. Add Terms of Use and Privacy Policy links to the subscription metadata.
6. Submit both products with the first app version that exposes the paywall.

Use App Store sandbox accounts or TestFlight for purchase, renewal, cancellation,
refund, and restore testing. No product configuration is needed outside App Store
Connect.

## Google Play Setup

In Play Console:

1. Create a yearly subscription with product ID
   `com.trakio.mobile.pro.yearly`, add an active yearly base plan, set its price
   and activate it.
2. Create a non-consumable one-time product with product ID
   `com.trakio.mobile.pro.lifetime`, set its price and activate it.
3. Complete the payments profile, merchant, tax, and product availability setup.
4. Upload an Android App Bundle to an internal testing track. Play Billing product
   queries do not work from an arbitrary sideloaded debug build.
5. Add license testers and test purchase, cancellation, grace period, account
   hold, restore/reinstall, acknowledgement, and both-products-owned behavior.

The Android subscription purchase passes the eligible base-plan offer token from
Play's product response. Missing or inactive base plans intentionally leave the
yearly option unavailable instead of opening a broken purchase flow.

## Enforcement

Quota is checked twice:

1. before navigating from pre-session setup
2. immediately before `runtime.start()` creates the recording session

Bundled demo sessions are excluded. Database count failures fail open because a
non-critical local read must not prevent GPS recording.

## Verification Matrix

Before release, test on an iOS 15.1 device, the latest stable iOS, and a Play
internal-testing Android device:

- free user at zero, two, three, and more than three sessions
- deleting one session at the free limit
- yearly purchase, lifetime purchase, cancellation, and restore on both stores
- yearly entitlement before expiration, during store billing grace, during the
  seven-day offline window, and after grace
- lifetime access after reinstall and while offline
- eligible early user updating online and offline
- eligible early user reinstalling on iOS 16 or newer
- fresh or reinstalled iOS 15 app remains Free without a verified paid purchase
- new iOS user whose original build is not allowlisted
- PDF/CSV gates and free social sharing
- production build with no raw JSON long-press path
- Android free quota, exports, purchase, acknowledgement, restore, cancellation,
  grace, account hold, reinstall, and subscription-management link

Trakio keeps its minimum deployment target at iOS 15.1 and builds with the latest
stable supported Xcode/iOS SDK. Raise the minimum only when a required feature or
dependency makes that necessary.
