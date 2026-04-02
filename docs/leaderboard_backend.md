# Leaderboard Backend

## Current State

The leaderboard backend currently uses:

- a Cloudflare Worker
- a D1 database
- public app requests with no authentication

This is acceptable for MVP testing, but it means the leaderboard API is currently open to abuse if someone discovers the endpoints and request format.

## Deferred Hardening Plan

The first planned protection layer is a simple shared API key between the app and the Worker.

### Goal

Require every leaderboard API request to send:

- `x-api-key: <value>`

And make the Worker reject requests without the correct key.

### Planned Changes

#### 1. Worker validation

File:

- `trakio-d1/src/index.ts`

Planned behavior:

- read `x-api-key` from request headers
- compare it to `env.LEADERBOARD_API_KEY`
- reject with `401` JSON if missing or incorrect

This should apply to:

- `GET /leaderboard/:trackId`
- `POST /leaderboard/share`

It does not need to apply to:

- `GET /health`

Planned response:

```json
{ "ok": false, "error": "Unauthorized" }
```

#### 2. Worker secret

Do not hardcode the key in source or Wrangler config.

Use a Wrangler secret instead:

- `LEADERBOARD_API_KEY`

Planned command:

```bash
npx wrangler secret put LEADERBOARD_API_KEY
```

#### 3. App header

Files:

- `trakio/app.json`
- `trakio/services/leaderboard.ts`

Planned behavior:

- store the app-side key in Expo config
- read it at runtime
- send it in the `x-api-key` header on leaderboard requests

#### 4. App failure behavior

If the key is missing locally:

- treat it as a configuration error

If the Worker returns `401`:

- treat it as a normal request failure for now

No special UI is required yet.

## Important Caveat

This is only a light protection layer.

Because the mobile app must know the key, it can always be extracted from the app bundle by a determined attacker.

So this should be treated as:

- useful friction against casual abuse
- not real authentication

## Later Improvements

After the API key layer, future hardening options could include:

- Cloudflare rate limiting
- stricter payload validation
- sanity checks on lap-time ranges per track
- abuse monitoring

True authentication is explicitly out of scope for this product.
