# Backend Docs

Reference material for the CozyVTT backend, for people working on CozyVTT
itself.

> **This is not a public API.** The routes described here are the ones CozyVTT's
> own web client calls. They are not versioned, carry no compatibility promise,
> and may change shape or disappear in a point release.
>
> A program *can* use them: there are no API keys or service accounts, but
> signing in with a user's own credentials returns a session cookie that works
> for both REST and Socket.io. It simply comes with no stability promise, and
> acts only with that user's permissions. Treat these files as a map of the
> current code.

## Files

| File | Purpose |
|------|---------|
| **`API_DOCUMENTATION.yaml`** | OpenAPI 3.0 description of every HTTP route — request shapes, response schemas, error codes, security requirements, examples. |
| **`WEBSOCKET_DOCUMENTATION.md`** | Reference for the Socket.io real-time event protocol. REST handles state changes; WebSockets carry live broadcasts (token movement, dice rolls, chat, and so on). |
| **`redocly.yaml`** | Lint/render config used by `@redocly/cli`. Tunes off a handful of intentionally-noisy default rules — see the comments inside the file. |
| **`api-docs.html`** | The spec rendered to a single standalone page. Generated locally and git-ignored, so it exists only if you have built it. |

## Working with the spec

### Check the docs still match the code

Both documents drift the moment something is added without a matching entry.
Two checks, run from the repository root:

```bash
python scripts/spec-coverage.py       # HTTP routes
python scripts/websocket-events.py --check   # Socket.io events
```

The first covers `API_DOCUMENTATION.yaml`, which must be complete in both
directions, and `docs/API_REFERENCE.md`, a hand-written guide that is allowed to
be partial but must not describe routes that do not exist — twelve of those had
accumulated, all wrong paths rather than removed features.

The second fails when an event exists in the handlers with no line in the
generated inventory. Refresh it with `--write`.

### Validate

```bash
cd backend
npx @redocly/cli lint docs/API_DOCUMENTATION.yaml --config docs/redocly.yaml
```

Reports `Your API description is valid` plus a handful of long-standing
warnings — 6 at the time of writing, all pre-existing and none of them
structural. Errors are worth acting on; that warning count is the baseline.

### Render to standalone HTML

```bash
cd backend
npx @redocly/cli build-docs docs/API_DOCUMENTATION.yaml --output docs/api-docs.html
```

The rendered page is git-ignored, so it is only ever as current as the last time
you ran this locally.
