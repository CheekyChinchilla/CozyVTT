# Backend Docs

This folder contains the public-facing API documentation for CozyVTT's backend.

## Files

| File | Purpose |
|------|---------|
| **`API_DOCUMENTATION.yaml`** | The OpenAPI 3.0 specification. Source of truth for every REST endpoint — request shapes, response schemas, error codes, security requirements, examples. Feed it into Swagger UI, Redoc, Postman, `openapi-generator`, etc. |
| **`WEBSOCKET_DOCUMENTATION.md`** | Reference for the Socket.io real-time event protocol. REST is for state changes; WebSockets are for live broadcasts (token movement, dice rolls, chat, etc.). Read this if you're writing a client that needs real-time updates. |
| **`redocly.yaml`** | Lint/render config used by `@redocly/cli`. Tunes off a handful of intentionally-noisy default rules for CozyVTT's design — see comments inside the file. |

## Working with the spec

### Validate

```bash
cd backend
npx @redocly/cli lint docs/API_DOCUMENTATION.yaml --config docs/redocly.yaml
```

Should report `Your API description is valid. 🎉` with zero errors and zero warnings. If it reports anything, the YAML is out of sync with the codebase — open an issue or PR.

### Render to standalone HTML

```bash
cd backend
npx @redocly/cli build-docs docs/API_DOCUMENTATION.yaml --output docs/api-docs.html
```

The output is a single self-contained HTML file (~1.6 MB) that you can:

- Open directly in a browser — no server needed
- Host at `/docs` on your CozyVTT instance — see [`docs/DEPLOYMENT.md` → "Hosting the API Documentation"](../../docs/DEPLOYMENT.md) for three patterns (public, behind-auth, repo-only)
- Drop into a docs site

`docs/api-docs.html` is gitignored — it's a build artifact, regenerate it locally when needed.

### Live preview while editing

```bash
cd backend
npx @redocly/cli preview-docs docs/API_DOCUMENTATION.yaml
```

Starts a local server with hot reload on the spec file. Useful while making bulk edits.

## Keeping the spec accurate

The spec is hand-maintained — it doesn't auto-generate from the route handlers. When you add or change an endpoint:

1. Update the matching path in `API_DOCUMENTATION.yaml`
2. Run the lint command above
3. Spot-check the rendered output

If you forget step 1, the lint command will still pass (the spec is self-consistent), but the spec will be out of sync with reality. Best caught in PR review.
