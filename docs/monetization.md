# Monetization Notes

## Current Position

The app should launch free first.

Reason:

- the core product still benefits from real-world adoption and feedback
- monetization should be based on features users actually value
- gating too early risks charging for the wrong things

## Base Principle

Core lap timing should remain free.

That includes:

- track selection
- session recording
- automatic lap detection
- sector timing
- internal GPS support
- external GPS support
- basic post-session review

The product has to prove itself before asking users to pay.

## Product Structure

The intended monetization structure is:

1. `Free`
2. `Pro`
3. `Track Map Packages`

This is not an either/or model.

The app should support:

- a free version
- a Pro version
- separate paid map packages on top

## Free

The free version should provide the full core recording experience.

Suggested structure:

- full recording experience
- limited number of saved sessions at one time
- user can delete old sessions to keep recording

Important:

- recording itself should not be blocked
- when the free limit is reached, the user should still be able to:
  - delete older sessions
  - continue using the app

This keeps the free tier useful while making long-term history a clear upgrade path.

## Pro

The Pro version should unlock the long-term product value.

Initial Pro direction:

- unlimited saved sessions

Possible later Pro additions:

- leaderboard submission
- advanced lap comparison
- deeper analytics
- exports

## Why Session Count Is a Good Gate

Even if a free user can delete old sessions and continue, there is still a real tradeoff:

- they lose long-term progress history
- they lose comparison over time
- they lose archived track-day memories

That friction is acceptable and can support a future paid upgrade.

## Features That Should Stay Free

The following should not be paywalled:

- basic recording
- automatic lap and sector timing
- external GPS support
- basic sharing

These features are core to trust and adoption.

## Track Map Packages

Track map packages are an additional monetization layer, not a replacement for Pro.

Concept:

- free app uses the current GPS-based view and timing workflow
- premium track packs unlock hand-mapped track geometry and more precise analysis on supported circuits

This would only make sense if the premium tracks provide clearly better value, such as:

- more precise mapped track geometry
- better driven-line comparison
- cleaner path reconstruction on supported tracks
- future reference-line or ideal-line analysis

If this is pursued later, track packs should be sold as bundles rather than as isolated single-track purchases.

Possible example:

- `Track Pack`
  - `¥500`
  - bundle of premium mapped tracks for a region or theme

The value proposition has to be obvious:

- not just prettier maps
- but genuinely better supported analysis on those tracks

## Recommended Rollout

1. Launch the app free.
2. Validate usage and user behavior.
3. Add Pro as the first paid layer.
4. Gate session count first.
5. Add more Pro value over time if needed.
6. Add premium track map packages only after the mapping workflow is proven.

## Early Users / Grandfathering

When monetization is introduced later, early users should be grandfathered into Pro.

Recommended rule:

- use Apple's app transaction data
- check the user's `originalPurchaseDate`
- if that date is earlier than the paywall launch date, grant Pro permanently

Why this is better than local-only checks:

- survives app reinstall
- survives device changes
- is tied to the App Store app download transaction
- is stronger than checking whether local sessions still exist

Recommended implementation timing:

- do not build this now
- implement it when monetization is actually added

At monetization time:

- define a fixed paywall launch date
- compare `originalPurchaseDate` against that cutoff
- if eligible, mark the user as `pro` with source `grandfathered`
- cache the granted entitlement locally after verification

Important:

- this should be based on Apple app transaction data, not local DB session count or install markers alone
- once grandfathered Pro is granted, it should not be taken away

## Technical Preparation

For now, the only gating logic worth preparing is session count.

Keep it minimal:

- local plan state: `free | pro`
- entitlement helper for session-save limits

There is no need to implement StoreKit grandfathering logic before monetization is real.

Map packages can be planned later as a separate entitlement layer once the mapped-track product is real.
