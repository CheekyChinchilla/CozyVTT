# Backend Docs

Reference material for the CozyVTT backend, for people working on CozyVTT
itself.

> **This is not a public API.** The routes described here are the ones CozyVTT's
> own web client calls. They are not versioned, carry no compatibility promise,
> and may change shape or disappear in a point release. There is also no way to
> authenticate as a program — the only mechanism is the browser session cookie —
> so there is nothing here to build a third-party integration on. Treat these
> files as a map of the current code.

## Files

| File | Purpose |
|------|---------|
| **`API_DOCUMENTATION.yaml`** | OpenAPI 3.0 description of every HTTP route — request shapes, response schemas, error codes, security requirements, examples. |
| **`WEBSOCKET_DOCUMENTATION.md`** | Reference for the Socket.io real-time event protocol. REST handles state changes; WebSockets carry live broadcasts (token movement, dice rolls, chat, and so on). |
| **`redocly.yaml`** | Lint/render config used by `@redocly/cli`. Tunes off a handful of intentionally-noisy default rules — see the comments inside the file. |
| **`api-docs.html`** | The spec rendered to a single standalone page. Generated locally and git-ignored, so it exists only if you have built it. |

## Working with the spec

### Check it still matches the code

The spec drifts the moment a route is added without a matching entry, which is
how it came to be missing eleven endpoints. This compares the two directly:

```bash
cd backend
python ../scripts/spec-coverage.py
```

It exits non-zero and names anything routed but undocumented, or documented but
no longer routed.

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
