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
| **`WEBSOCKET_DOCUMENTATION.md`** | Reference for the Socket.io real-time event protocol. REST loads and edits campaign data; the live table (token moves, walls, lights, fog, chat, dice, initiative and more) is changed and broadcast over Socket.io. |
| **`redocly.yaml`** | Lint/render config used by `@redocly/cli`. Tunes off a handful of intentionally-noisy default rules — see the comments inside the file. |
| **`api-docs.html`** | The spec rendered to a single standalone page. Generated locally and git-ignored, so it exists only if you have built it. |

## Working with the spec

### Check the docs still match the code

Both documents drift the moment something is added without a matching entry.
Two checks, run from the repository root:

```bash
python3 scripts/spec-coverage.py       # HTTP routes
python3 scripts/websocket-events.py --check   # Socket.io events
python3 -m unittest discover -s scripts/tests # their tests, and the nginx and coverage scripts'
```

The first covers `API_DOCUMENTATION.yaml`, which must be complete in both
directions, and `docs/API_REFERENCE.md`, a hand-written guide that is allowed to
be partial but must not describe routes that do not exist — twelve of those had
accumulated, all wrong paths rather than removed features. It also loads the
YAML file when PyYAML is installed (CI installs it; locally, `pip install
pyyaml`), because the route check reads it line by line and does not care
whether it loads, and three unquoted colons once made it unloadable.

It reads the routes from `backend/src/app.ts`, where `createApp` mounts every
router, and from `server.ts`, and fails on any route declaration or mount it
cannot read: a path held in a variable or worked out in a template,
`router.route()`, `router.all()`, or a router mounted inside another. Each
would leave a route out of both counts while the check passed. It also checks
every request the frontend's API client (`frontend/src/services/api.ts`)
sends against the catalogue, so a route renamed in the routers and the YAML
fails here before the page's request answers 404.

The second regenerates the event inventory from the handlers and fails on any
difference from the one in the doc: a new or removed event, a handler that
gained or lost a gate, or a hand-edited cell. Refresh it with `--write`. It
reads `backend/src/websocket/`, `backend/src/routes/` and
`backend/src/services/` (a service can emit too: the ambient-audio setter
broadcasts for both the panel and the vibe switch), and matches
every `.emit(` (on a socket, a room or the server) alongside the
`broadcastToCampaign` / `broadcastToUser` helpers,
the token move handlers' `emitMoveToVisibleSockets`, which takes the event
name as its first argument, and `emitToMapReaders` and the map routes'
`tellMapReaders`, with their per-role forms `emitToMapReadersAs` and
`tellMapReadersAs`, whose event name is their first quoted argument —
a route pushing an event through a helper reaches a client just as surely as a
handler emitting one, and while the scan covered only handlers the table called
itself complete while omitting seven such events. The connection's own
`disconnect`, `error` and `ping` handlers and the `error` the server sends are
left out of the table; the guide describes them by hand, under Event
Reference.

The **Who may send it** column is read from the handler and from any function
in the same file that it calls directly, each only as far as the end of its own
body. The first row that matches decides the cell:

| The handler, or a function it calls | Reads |
|---|---|
| Turns every non-DM away: an `if` among its own statements (inside a `try` counts; a nested block, an `else` or a callback does not) whose branch ends in a bare `return;`, and whose condition is `socket.role !== 'DM'` alone or as one side of an *or*, or whose refusal says "Only the DM" | DM only |
| Calls `canToggleDoor` | DM; a player may toggle an unlocked door (adding which ones: "on a lit map, one their tokens see" when it also calls `.seesPoint(`, "under manual fog, one beside a square revealed to them" when it also calls `doorBesideRevealedFog`) |
| Calls `canControlToken` | DM, or the token's player (adding "while the session is live" when it also calls `canMoveTokensNow`, and "once the DM has put it in the order", "before the fight starts" and "once each time it joins the order" when it tests `existingIndex === -1`, reads `state.active` and calls `playerHasRolled`) |
| Calls `canDraw` | DM, or a player while **Players may draw** is on and the session is live |
| Calls `canEraseDrawing` | DM, or the drawing's player |
| Tests `character.userId !== socket.userId` | DM, or the character's owner (adding "never a spectator" when it also tests `socket.role === 'SPECTATOR'`) |
| Calls `canRollDice` | DM and players |
| None of these | Any member |

`socket.role !== 'DM' && …` refuses only some non-DMs, as the character-owner
test does, so it does not read as DM only. A rule written inline instead of
through the shared predicates in `services/permissions.ts` is not seen, which
is one more reason to use them; the line above the table says the handler is
authoritative.
Comments are blanked before any of this is read, so a gate that is commented
out changes the row just as deleting it would, and a handler or an emit that
is commented out is not listed.

The **Sent to** column of the server's events is read from each place the
event is sent: the helper it goes through (`broadcastToCampaign` the campaign,
`broadcastToUser` one user's sockets, `emitToMapReaders` and `tellMapReaders`
map readers, their `As` forms map readers as their role sees it,
`emitMoveToVisibleSockets` map readers sent the token), or what `.emit(` is
called on: `socket` inside a `socket.on(` or `io.on(` callback is the sender
and elsewhere one socket, `socket.to(…)` the campaign but the sender,
`io.to(…)` one user's sockets when its argument names a `userId` and the
campaign otherwise, and anything else (a loop's `s` or `r`) members the handler
picks. An event sent from several places lists each.

The check fails, in every mode, on a handler or emit whose event name is not
a quoted string, such as a name held in a variable or built in a template:
the table would leave it out. The broadcast helpers' own bodies pass on the
event they were given, by design, and are not counted. Both scripts read the
source through `scripts/tssource.py`, which blanks comments and strings
without moving anything, and `scripts/tests/` feeds them small sources in
every form the code uses.

The WebSocket guide's table of flood ceilings is checked as well, by the
backend test suite rather than by these scripts:
`backend/src/__tests__/keepInStep.test.ts` fails when the ceiling the guide
states for an event differs from the one the server applies (`SOCKET_CEILINGS`
in `backend/src/websocket/shared.ts`). Change the two together.

The events the table marks **DM only** are tested from it, too:
`backend/src/websocket/__tests__/dmOnlyEvents.integration.test.ts` sends each
of them as a player and as a spectator and expects a refusal, no broadcast
and nothing stored. It then sends each payload as the DM and expects the
table to hear it, so a refusal cannot be a payload the server would turn
down from anyone. It fails when the table has a DM-only event it has no
payload for, so an event the handlers make the DM's alone needs two lines
there: its payload, and the event a player hears when the DM sends it.

`backend/src/__tests__/documentedFacts.test.ts` reads these files too: every
route the YAML's prose names in backticks, such as `` `GET /api/campaigns` ``,
must be one of its documented paths, and the header of `redocly.yaml` must say
how many lint rules it turns off. `keepInStep.test.ts` checks the YAML's list
of the kinds of thing that can use an asset against the code.

### Validate

```bash
cd backend
npx @redocly/cli lint docs/API_DOCUMENTATION.yaml --config docs/redocly.yaml
```

Reports `Your API description is valid` plus a handful of long-standing
warnings — 6 at the time of writing, all pre-existing and none of them
structural. Errors are worth acting on; that warning count is the baseline.
The count can move between Redocly releases, so to compare two versions of
the spec, run the same release on both (`npx @redocly/cli@<version> lint …`).
Lint is not one of the gates.

### Render to standalone HTML

```bash
cd backend
npx @redocly/cli build-docs docs/API_DOCUMENTATION.yaml --output docs/api-docs.html
```

The rendered page is git-ignored, so it is only ever as current as the last time
you ran this locally.
