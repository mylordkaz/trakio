# App Update Policy

Trakio checks the published App Store version whenever the iOS app starts or
returns to the foreground. It does not interrupt an active recording.

## Optional updates

If the App Store version is newer than the installed version, Trakio shows an
**Update / Later** prompt. Choosing Later suppresses that version for 24 hours.
The prompt includes the App Store release notes when Apple returns them.

## Mandatory updates

The minimum supported iOS version is stored in:

`config/app-update-policy.json`

Installed apps read that file from the `main` branch. To make a released
version mandatory, change `minimumSupportedVersion` after that version is
available on the App Store. For example:

```json
{
  "ios": {
    "minimumSupportedVersion": "1.4.0"
  }
}
```

Any installed version below that value then receives an **Update required**
prompt with no Later action. The client verifies that the minimum version is
actually available on the App Store before enforcing it.

If either remote check is unavailable, Trakio continues normally so an
internet outage cannot block a driver at the track.

Version 1.3.1 is the first release containing this update checker. Older
installed versions cannot receive an in-app prompt until the user installs
1.3.1 through the App Store once.
