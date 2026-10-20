# CozyVTT — Development Setup

This guide covers everything you need to run CozyVTT locally **for development work** — hot reload, exposed ports for debugging, source-mounted volumes.

> 🚨 **Looking to deploy a production instance?** You're in the wrong file. See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for the production setup guide (hardened Docker stack, Nginx reverse proxy, SSL/TLS, backups). Deploying the dev stack to a public-facing server is a security risk — it exposes the database port and runs services with hot-reload tooling and verbose logging.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Repository Structure](#repository-structure)
3. [Environment Variables](#environment-variables)
4. [Local Setup (Without Docker)](#local-setup-without-docker)
5. [Local Setup (With Docker)](#local-setup-with-docker)
6. [Database Setup](#database-setup)
7. [Running the App](#running-the-app)
8. [Running Tests](#running-tests)
9. [Code Style](#code-style)
10. [Git Workflow](#git-workflow)

---

## Prerequisites

| Tool | Minimum Version | Notes |
|------|----------------|-------|
| Node.js | 26.x | Use `nvm` or `fnm` to manage versions |
| PostgreSQL | 14+ | Or use the Docker Compose stack |
| npm | 11+ | Comes with Node.js 26 |
| Docker + Docker Compose | Any recent | Optional — needed for the containerized setup |
| Python | 3 | For the documentation checks; `pip install pyyaml` for the YAML and nginx checks |

---

## Repository Structure

```
cozyvtt/
├── backend/               Express API server
│   ├── src/
│   │   ├── config/        Configuration loading and validation
│   │   ├── game-systems/  The GameSystem enum, re-exported from Prisma
│   │   ├── middleware/     Auth and role guards, the sign-in and other limiters, upload checks
│   │   ├── routes/        Express route handlers
│   │   ├── scripts/       Scripts run by hand: data migrations, checks, the SRD creature seed
│   │   ├── services/      Business logic layer
│   │   ├── types/         Shared TypeScript types
│   │   ├── utils/         Helpers (dice parser, asset URLs, etc.)
│   │   ├── validators/    Zod validation schemas
│   │   └── websocket/     Socket.io event handlers
│   ├── prisma/
│   │   ├── schema.prisma  Database schema
│   │   ├── migrations/    Migration history
│   │   └── seed.ts        Placeholder for development seed data (creates nothing yet)
│   ├── scripts/           start.sh (the images' entrypoint: waits for the database,
│   │                      applies migrations), backup.sh and restore.sh
│   └── docs/              Backend-specific docs (OpenAPI YAML, WS docs)
│
├── frontend/              React + Vite client
│   ├── src/
│   │   ├── assets/fonts/  The bundled typefaces and their licences
│   │   ├── components/    Reusable UI components (incl. ui/ primitives)
│   │   │   └── character-sheets/  Game system sheet components
│   │   ├── constants/     Game system labels, and limits copied from the backend (keepInStep.test.ts compares them)
│   │   ├── contexts/      React context providers (Auth, WebSocket, Campaign, Theme, Toast)
│   │   ├── stores/        Zustand store for live session state
│   │   ├── hooks/         Custom React hooks (incl. queries/ for React Query)
│   │   ├── lib/           React Query client setup
│   │   ├── pages/         Top-level page components
│   │   ├── services/      API and Socket.io client wrappers
│   │   ├── styles/        Global CSS and effect stylesheets
│   │   ├── types/         TypeScript type definitions
│   │   └── utils/         Client-side helpers
│   ├── e2e/               Playwright smoke tests against a running instance
│   └── public/            Static assets
│
├── .github/               The CI workflow, Dependabot's settings and the issue templates
├── assets/                The logo the README shows
├── docs/                  User and developer documentation
├── Examples/              Example character sheets for each game system, as JSON
├── nginx/                 The bundled reverse proxy's configuration
├── scripts/               The doc, nginx and coverage checks (Python)
├── docker-compose.yml     Production Docker stack (default)
├── docker-compose.dev.yml Development Docker stack (hot-reload, exposed ports)
└── .env.example           Environment variable template
```

---

## Environment Variables

### Backend (`backend/.env`)

Copy `backend/.env.example` to `backend/.env` and fill in the values.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `SHADOW_DATABASE_URL` | No | — | A scratch database for `prisma migrate diff` and `prisma migrate dev`, read only by `prisma.config.ts`; see [Running Migrations](#running-migrations) |
| `SESSION_SECRET` | Yes | — | Random string for session signing (32+ chars) |
| `NODE_ENV` | No | `development` | `development` or `production` |
| `PORT` | No | `4000` | Port the API server listens on |
| `CORS_ORIGIN` | No | `http://localhost:3000` | Allowed origin for CORS |
| `SMTP_HOST` | No | — | SMTP server hostname. Email is on only when `SMTP_HOST`, `SMTP_USER` and `SMTP_PASS` are all set (`isSmtpConfigured`) |
| `SMTP_PORT` | No | `587` | SMTP server port |
| `SMTP_USER` | For email | — | SMTP login username; without it email is off, because the transport always sends a login |
| `SMTP_PASS` | For email | — | SMTP login password; without it email is off |
| `SMTP_FROM` | No | `SMTP_USER` | From address for outbound email |
| `SMTP_SECURE` | No | `false` | Use TLS (`true`) or STARTTLS (`false`) |
| `APP_URL` | No | `http://localhost:3000` | Public URL used in email links |
| `FRONTEND_URL` | No | — | An older name for `APP_URL`, read only when `APP_URL` is not set |
| `INSTANCE_NAME` | No | — | The name emails use while the name in Admin > Settings is empty or still CozyVTT |
| `SETUP_TOKEN` | No | — | The token the setup wizard asks for; unset, the backend makes one and prints it in its log until setup has run |
| `UPLOAD_DIR` | No | `uploads` | Where uploaded files are stored, relative to the backend folder |
| `BACKUP_DIR` | No | `backups` | Where the Admin Dashboard writes backups; must not be inside the uploads folder |
| `SESSION_MAX_AGE` | No | `3600000` | Milliseconds a sign-in lasts without a request |
| `REMEMBER_ME_MAX_AGE` | No | `2592000000` | Milliseconds a **Remember me** sign-in lasts, and the longest any sign-in lasts |
| `RATE_LIMIT_MAX_REQUESTS` | No | `300` | Requests per minute to `/api` from one address |
| `CAMPAIGN_ARCHIVE_RATE_LIMIT` | No | `20` | Campaign previews, imports and exports per user per hour, counted apart |
| `LOG_LEVEL` | No | `debug` in development, `info` in production | `debug`, `info`, `warn` or `error` |
| `MAX_MAP_SIZE_MB` | No | `50` | Upload size limit for map images |
| `MAX_TOKEN_SIZE_MB` | No | `5` | Upload size limit for token images |
| `MAX_AUDIO_SIZE_MB` | No | `20` | Upload size limit for audio files |
| `MAX_AVATAR_SIZE_MB` | No | `2` | Upload size limit for avatar images |
| `MAX_DOCUMENT_SIZE_MB` | No | `50` | Upload size limit for PDF, text and Markdown documents |
| `NGINX_MAX_BODY_SIZE` | No | — | Request body cap for the bundled Nginx (`client_max_body_size`, `55M` in `docker-compose.yml`); must cover the largest limit above. The backend only reads it for a startup warning, so leave it unset here: unset, it takes it that a proxy of your own is in front and says what that proxy must allow |
| `ASSET_UPLOAD_RATE_LIMIT` | No | `30` | Asset uploads per minute per user |

The `MAX_*_SIZE_MB` values are read at startup by `backend/src/utils/fileUtils.ts` and served to the SPA by `GET /api/config`, so a restart is enough to change them — no rebuild. Non-numeric or non-positive values are ignored with a startup warning.

**Example `backend/.env` for local development:**

```env
DATABASE_URL="postgresql://cozyvtt:cozyvtt@localhost:5432/cozyvtt"
SESSION_SECRET="dev-session-secret-change-in-production-please"
NODE_ENV="development"
PORT=4000
CORS_ORIGIN="http://localhost:3000"
```

### Frontend dev server

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_ALLOWED_HOSTS` | No | — | Comma-separated allowed hostnames for the Vite server |
| `VITE_PROXY_TARGET` | No | `http://localhost:4000` | Where the Vite dev server sends `/api` and `/socket.io` |

The dev server reads these two from the environment it is started in, not from
`frontend/.env`: `vite.config.ts` is read before Vite loads a `.env` file. The
dev stack sets both (`VITE_ALLOWED_HOSTS` from the root `.env`). Outside Docker,
put them before the command, for example
`VITE_ALLOWED_HOSTS=mybox.local npm run dev`.

The app asks its own address for the API and the live connection, and the Vite dev server proxies `/api` and `/socket.io` to the backend, so in development as in production everything is served from one address. Serving the backend from a different address than the page is not supported: the code still reads `VITE_API_URL` and `VITE_SOCKET_URL`, but with them set every picture, sound and PDF document is refused by the page's security policy and the backend's resource policy. What it would take is a backlog entry in [FUTURE_FEATURES.md](./FUTURE_FEATURES.md).

---

## Local Setup (Without Docker)

### 1. Install dependencies

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

Each project's `package.json` names under `allowScripts` the packages that
run a script while they install: the Prisma packages fetch the database engines
that way, argon2 checks for its prebuilt binary, and a few developer tools set
up their own binaries. Each project's `.npmrc` turns on npm's
`strict-allow-scripts` setting, so when a package with such a script is not on
the list, the install fails before anything is installed, with
`ESTRICTALLOWSCRIPTS` and the package's name and script. That holds for
`npm install` and `npm ci`, in the images, in CI and on your machine. Without
the setting, npm 11 (11.20.0 comes with Node.js 26.12.0, and builds the images
and CI) runs such a script and prints a warning, and npm 12 (12.2.0 is
released) skips it and prints a warning. When a new dependency brings one,
read what its script does, then add `"<package>": true` under `allowScripts`
in that project's `package.json` and install again; `npm install-scripts ls`
and `approve` work only on a tree that is already installed.
`dependencySources.test.ts` fails until the list matches the lockfile.

### 2. Set up PostgreSQL

Create a database and user:

```sql
CREATE USER cozyvtt WITH PASSWORD 'cozyvtt' CREATEDB;
CREATE DATABASE cozyvtt OWNER cozyvtt;
```

The user owns the database so the migrations can create tables in its `public`
schema, which PostgreSQL 15 and later no longer lets every user do, and
`CREATEDB` lets `prisma migrate dev` make the scratch database it compares the
schema in.

### 3. Configure environment

```bash
cp backend/.env.example backend/.env
# Edit backend/.env with your DATABASE_URL and secrets
```

### 4. Run database migrations

```bash
cd backend
npx prisma migrate dev
npx prisma generate
```

The Prisma command-line tools take their settings, the database address
among them, from `backend/prisma.config.ts`, which loads `backend/.env`.
Since Prisma 7, `migrate dev` and `db push` no longer generate the client, so
`npx prisma generate` follows them; `npm run build` runs it too.

### 5. Create the administrator

There is no seed data yet: `backend/prisma/seed.ts` is a stub that logs two lines and creates nothing, so `npm run prisma:seed` does nothing useful. A fresh database starts with the setup wizard, which creates the administrator account. Start the backend and the frontend (below), open the app and complete the wizard. It asks for a setup token that the backend prints in its log; see [DEPLOYMENT.md](DEPLOYMENT.md#4-complete-the-setup-wizard).

---

## Local Setup (With Docker)

> ⚠️ **This section is for local development only.** The command below runs the **dev stack** (`docker-compose.dev.yml`), which publishes the database, the backend and the frontend on this computer only (`127.0.0.1`), runs the backend under Node's watch mode in development mode with verbose logging, and runs the frontend under Vite's dev server with hot module replacement. **Do not use this for a public deployment.** For production, use the plain `docker-compose.yml` and follow **[DEPLOYMENT.md](./DEPLOYMENT.md)**.

```bash
# Copy the root .env template
cp .env.example .env
# Edit .env — at minimum set DATABASE_PASSWORD, SESSION_SECRET

# NOTE: the -f flag is REQUIRED. Without it you'll start the production stack.
docker compose -f docker-compose.dev.yml up
```

> The dev stack runs the backend as an unprivileged user from the start, with no
> root step to fix ownership, so create the two bind-mounted folders yourself before
> the first `up`: `mkdir -p backend/uploads backend/backups`. Docker would otherwise
> create a missing one as root and the backend could not write to it.

Services, each published on `127.0.0.1` so that only this computer can reach them:
- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:4000`
- PostgreSQL: `localhost:5432`

The backend always runs with `NODE_ENV=development` here, whatever `.env` says (`.env.example` sets `production`, for the production stack), so the example secrets only draw a warning and errors show their details. The browser reaches the backend through Vite's proxy on `localhost:3000`, the page's own address, as it reaches it through nginx in production.

To open the dev stack from another device, such as a phone on your network, publish the frontend on a second port open to every interface, with a compose file of your own that git ignores (`*.local.yml`):

```yaml
# docker-compose.dev.local.yml
services:
  frontend:
    ports:
      - "3001:3000"
```

```bash
docker compose -f docker-compose.dev.yml -f docker-compose.dev.local.yml up
```

Then open `http://<this computer's address>:3001` on the other device; a name rather than an address also needs adding to `VITE_ALLOWED_HOSTS` in `.env`. Anyone on that network can reach it too, so do this only on a network you trust.

The backend container runs `npm run dev`, which restarts the backend when a file it has loaded changes (`node --watch`, below). The frontend container runs `vite` with hot module replacement. The backend's start script (`backend/scripts/start.sh`) applies any pending migrations with `prisma migrate deploy` each time the container starts.

**Each container has its own `node_modules` and its own generated Prisma client.** Source is bind-mounted, `node_modules` is not, so after adding a dependency or changing `schema.prisma` the running container does not see it until you tell it to. Vite answers a missing package with a 500 and the app shows "Something went wrong"; the backend throws on the first query that touches a new table:

```bash
# After `npm install <package>` on the host, in either project:
docker compose -f docker-compose.dev.yml exec --user root frontend npm install
docker compose -f docker-compose.dev.yml exec --user root backend npm install

# After changing prisma/schema.prisma:
docker compose -f docker-compose.dev.yml exec --user root backend npx prisma generate
```

`--user root` is needed because `npm install` rewrites `package.json` and `package-lock.json` in the project folder, which is your checkout mounted into the container and belongs to your account on the host, not to the container's `appuser`. Without it, `npm install` fails with `EACCES: permission denied, open '/app/package-lock.json'`; `node_modules` itself is `appuser`'s, since both images hand `/app` to it before switching user. Root rewrites the two files in place, so they keep your account as their owner. What an install as root adds to `node_modules` belongs to root, so run `prisma generate`, which writes there too, with `--user root` as well. Rebuilding the image does the same thing more slowly, with `-V` so the new container does not keep the old `node_modules` volume: `docker compose -f docker-compose.dev.yml up --build -V`. Do the same after pulling a change to either `package.json`, such as the move to Prisma 7 in 1.5.3: without `-V`, `up --build` alone leaves the backend on the packages it had before.

### Security headers are production-only

The app page's `Content-Security-Policy` and the other security headers come from the frontend container's nginx (`frontend/security-headers.conf`), which only exists in the production image. The Vite dev server serves its own page with an inline module script for hot reload, so the production policy would stop `npm run dev` working.

The practical consequence: **a CSP violation cannot appear during development**. If you add something that loads from a new host — a font, an image, an API on another domain — check it against `frontend/security-headers.conf`, and test it against a production build before assuming it works. `frontend/src/__tests__/securityHeaders.test.ts` pins the policy's shape but cannot know what your feature loads.

### Production vs Development at a glance

| | Production (`docker-compose.yml`) | Development (`docker-compose.dev.yml`) |
|---|---|---|
| Backend | Compiled JS, no source on disk | Source mounted, `node --watch` |
| Frontend | Pre-built static files via Nginx | Vite dev server with HMR |
| Database port | **Not exposed to host** | Exposed on `localhost:5432` |
| Backend port | **Not exposed to host** | Exposed on `localhost:4000` |
| Public entry | Nginx reverse proxy on 80/443 | Direct ports per service |
| Logging | JSON, written to disk and rotated at 10 MB | Pretty-printed, console |
| Suitable for | Internet-facing instances | Local hacking only |

---

## Database Setup

### Running Migrations

```bash
# Apply all pending migrations
cd backend
npx prisma migrate dev

# Create a new migration after schema changes
npx prisma migrate dev --name describe_your_change

# Either way, then regenerate the client (migrate dev no longer does)
npx prisma generate

# Apply migrations in CI / production (no prompts)
npx prisma migrate deploy
```

> ⚠️ **If `migrate dev` reports drift and offers a reset, answer no: a reset deletes everything in the database.** The sign-in session store makes a table named `session` the first time the backend starts. Until 1.5.3 no migration made it, so on a database the backend ran against before then, `migrate dev` finds a table its migrations do not account for and offers that reset. `npx prisma migrate deploy` applies the migration that describes the table, which finds it and changes nothing, and the backend container's start script runs that command each time the container starts; outside Docker, run it yourself. From then on the database matches the migrations. `migrate dev` also refuses to run where it cannot ask questions, such as from a script. Either way, a migration can be generated from the existing migrations into a scratch database instead. Prisma empties that database each time, so give it one of its own:
>
> ```bash
> # Once, with the dev stack running:
> docker compose -f docker-compose.dev.yml exec database createdb -U cozyvtt cozyvtt_shadow
>
> # Each new migration, from backend/ (the folder name is a UTC timestamp and a name):
> mkdir -p prisma/migrations/20261011120000_describe_your_change
> npx prisma migrate diff --from-migrations prisma/migrations \
>   --to-schema prisma/schema.prisma \
>   --script > prisma/migrations/20261011120000_describe_your_change/migration.sql
> npx prisma migrate deploy
> npx prisma generate
> ```
>
> `migrate diff` finds the scratch database through `prisma.config.ts`, which
> reads its address from `SHADOW_DATABASE_URL`. Add it to `backend/.env`:
>
> ```bash
> SHADOW_DATABASE_URL="postgresql://cozyvtt:YOUR_DATABASE_PASSWORD@localhost:5432/cozyvtt_shadow"
> ```
>
> A fresh database that the backend has never started against has no `session` table, and `migrate dev` works on it as usual.

### Exploring the Database

Prisma Studio is a web-based database browser:

```bash
cd backend
npm run prisma:studio
# Opens http://localhost:51212, or another free port it names when that one is taken
```

### Schema Location

The Prisma schema is at `backend/prisma/schema.prisma`. All model changes go through Prisma migrations — do not modify the database directly in development.

---

## Running the App

### Development (hot reload)

```bash
# Terminal 1 — Backend
cd backend
npm run dev
# API running at http://localhost:4000

# Terminal 2 — Frontend
cd frontend
npm run dev
# App running at http://localhost:3000
```

The Vite dev server proxies all `/api/*` and WebSocket traffic to the backend. You only need to open `http://localhost:3000`.

The backend's `npm run dev` is `node --watch -r ts-node/register src/server.ts`. Node watches every file the backend has loaded and, when one changes, stops the backend with SIGTERM, so it closes its sockets and database connections as it does when Docker stops the production container, and starts it again. A new file is watched once something imports it. A change to a file the backend never loads does not restart it: tests, `.env` and `prisma/schema.prisma` among them. After a type error, the backend stays stopped until the next change to a file it loaded.

### Building for Production

For production builds, use Docker Compose — it handles the multi-stage builds and wires everything together:

```bash
docker compose up -d --build
```

To build manually (e.g. for a non-Docker deployment):

```bash
# Build the frontend
cd frontend
npm run build
# Output in frontend/dist/ — serve with Nginx or any static file server

# Compile the backend
cd ../backend
npm run build
# Output in backend/dist/
node dist/server.js
```

See [docs/DEPLOYMENT.md](DEPLOYMENT.md) for full production deployment instructions.

---

## Running Tests

### Backend Tests (Jest)

The integration tests need a PostgreSQL database of their own, which they fill
and empty as they run. Start a throwaway one in Docker and load the schema into
it:

```bash
docker run -d --name cozyvtt-test-pg -e POSTGRES_USER=cozyvtt -e POSTGRES_PASSWORD=cozyvtt \
  -e POSTGRES_DB=cozyvtt_test -p 55500:5432 postgres:15-alpine
cd backend
DATABASE_URL=postgresql://cozyvtt:cozyvtt@localhost:55500/cozyvtt_test npx prisma db push
```

Run the same `db push` again after switching to a branch with a different
schema. It changes only the database; `npx prisma generate` brings the client
up to date.

Then run the suite, or one file, with the same `DATABASE_URL`:

```bash
DATABASE_URL=postgresql://cozyvtt:cozyvtt@localhost:55500/cozyvtt_test npx jest
DATABASE_URL=postgresql://cozyvtt:cozyvtt@localhost:55500/cozyvtt_test npx jest src/routes/__tests__/auth.e2e.test.ts
```

Tests live in `backend/src/**/__tests__/`, or beside the code as `name.test.ts`. Unit tests use Jest; integration tests use Supertest against an in-process server.

> **The run refuses a database without `test` in its name.** The suites
> write to the database freely: they add accounts and campaigns, several
> change the instance's settings, and five create and drop schemas of their
> own. So
> jest stops before any suite starts unless the database `DATABASE_URL` names
> has `test` in its name as a word: `cozyvtt_test` and `cozyvtt_test_2` pass,
> `cozyvtt` does not. With `DATABASE_URL` unset it checks the database
> `backend/.env` names, which is your development database, and refuses it.
> The check is `src/__tests__/helpers/testDatabaseGuard.ts`.

> **The sign-in table comes from the push.** The backend keeps sign-ins in a
> table named `session`, which the session store creates when the server
> starts, and the suites that end an account's sign-ins write to it. The
> Prisma schema describes it, so `prisma db push` lays it out and keeps it.
> If those suites fail with `relation "session" does not exist`, the test
> database was last pushed from an older branch: run the `db push` above
> again.

### Frontend Tests (Vitest)

```bash
cd frontend
npm test                  # Interactive watch mode
npm run test:run          # Run once (CI mode)
npm run test:coverage     # Generate coverage report
```

The runner is Vitest 5, on Vite 8. On a machine short of memory, cap the
workers a run starts with `npx vitest run --maxWorkers=2`; Vitest 5 has no
`--minWorkers` option and stops with "Unknown option" if given one.

Tests live alongside the components they test in `__tests__/` subdirectories or as `.test.tsx` files.

### Browser smoke tests (Playwright)

`frontend/e2e/` holds a handful of end-to-end tests that drive a real browser
(Chromium, at a desktop and a phone size) through a running instance: the
setup wizard on a fresh one, signing in and out, creating a campaign and
opening it with its live connection, and nothing wider than the screen on a
phone. CI runs them against the production stack it has just built. To run
them yourself, start an instance, then from `frontend/`:

```bash
npx playwright install chromium     # once, to fetch the browser (add --with-deps on Linux, as CI does)
E2E_BASE_URL=http://localhost:3000 E2E_SETUP_TOKEN=<the setup token> npm run test:e2e
```

The first test finishes the setup wizard, so point them at an instance you
can throw away; on one already set up, it is skipped and the others sign in
as `E2E_ADMIN_EMAIL` with `E2E_ADMIN_PASSWORD`. The settings are listed in
`frontend/e2e/instance.ts`. One test's check of the page's security headers
runs only with `E2E_PRODUCTION=1`, since the development server sends none.

### Checking sign-in by hand

The automated suites cover sign-in from both ends: the backend's route tests
(`backend/src/routes/__tests__/auth.e2e.test.ts`, the MFA and limiter suites)
and the browser's session handling (`frontend/src/contexts/__tests__/`, such
as `adoptSession.test.tsx` and `sessionKeepalive.test.tsx`). After a change to
sign-in, also click through it once on a running instance, with the browser's
developer tools open on the Network tab:

| Do this | You should see |
|---|---|
| Open the app signed out | The sign-in page, and `GET /api/auth/me` answered 401 |
| Sign in with a wrong password | "Invalid email or password", and you stay on the sign-in page |
| Sign in correctly | The dashboard; `GET /api/auth/me` now answers 200 with your account |
| Sign in with **Remember me** ticked, then reload the page | Still signed in, with no sign-in page in between |
| Create an account on **Create Account** (registration must be open) | The dashboard, signed in, or **Registration Submitted** when an admin must approve new accounts |
| Sign in to an account with two-factor sign-in on | The code page; **Verify Code** with a code from the authenticator app signs you in |
| **Change Password** on the profile page, then sign out and back in | The new password works and the old one does not |
| **Sign Out** on the profile page | The sign-in page; `GET /api/auth/me` answers 401 again |

### Type Checking

```bash
# Backend
cd backend && npx tsc --noEmit

# Frontend: the app, then e2e/ and playwright.config.ts (e2e/tsconfig.json),
# then vite.config.ts and vitest.config.ts (tsconfig.node.json)
cd frontend && npm run typecheck
```

### Everything, before you call something done

Run the lot, not a subset — this is what CI runs, and what a reviewer will
assume you ran:

```bash
# Frontend
cd frontend && npm run typecheck && npm run lint && npx vitest run --maxWorkers=2 && npm run build

# Backend. The Prisma client is generated, not committed: without a fresh one,
# every column added since the last generate is a type error.
cd backend && npx prisma generate && npx tsc --noEmit && npm run lint && \
  DATABASE_URL=postgresql://cozyvtt:cozyvtt@localhost:55500/cozyvtt_test npx jest

# Documentation, from the repository root (on Windows the command is usually
# `python`)
python3 scripts/spec-coverage.py
python3 scripts/websocket-events.py --check
python3 -m unittest discover -s scripts/tests
```

Some of those deserve a note:

- **`npx vitest run`, not `npm test`.** The latter is watch mode and will sit
  there until you notice.
- **The production build leaves out `console.log`, `info`, `debug` and
  `trace`.** `frontend/vite.config.ts` marks them as calls with no effect, so
  the build removes them; `console.error` and `console.warn` stay. After
  `npm run build`, CI looks in `dist/assets` for four lines only such calls
  print and fails if one is there. A misplaced build option only draws a
  warning from Vite. `npm run typecheck` checks `vite.config.ts` against
  the types of Vite's options, but the file is not linted, so read the
  build output after changing it.
- **The backend run manages its own database connections.** Every test file
  builds its own Prisma clients and jest reuses workers across files, so a
  full run once crept up to PostgreSQL's default ceiling of a hundred
  connections and unrelated suites failed with "too many clients already".
  Two files under `src/__tests__/helpers/` (`jest.setup.ts`,
  `jest.afterEnv.ts`) cap each pool and disconnect each file's clients when
  it ends; if you see that error again, look there first, not at the code.
  That disconnect runs before a file's own top-level `afterAll`, so a file
  that cleans up the database there ends it with `prisma.$disconnect()`.
- **A test that needs the server to survive a request runs it as a process of
  its own.** An uncaught exception inside Jest fails the test and nothing
  else, so it cannot show that a request would end the real server.
  `src/__tests__/helpers/serve-test-app.ts` starts the test app on a free
  port in a child process, and `malformedUpload.e2e.test.ts` uses it to send
  crafted upload bodies and check that the server answers and is still up.
- **A test that needs a brand new instance gets a schema of its own.** The
  suites share one database and run at once, so none can count on it being
  empty. The setup wizard suite, the first-admin and last-admin race tests,
  the admin settings log suite and the sign-in table's own test need exactly
  that, so `src/__tests__/helpers/isolatedSchema.ts` creates a PostgreSQL
  schema in the same test database from `schema.prisma`, and drops it at the
  end. The file sets `DATABASE_URL` to that schema before it loads the app,
  with `require` (see TypeScript below), because the app's database client
  reads it once.
- **Facts written in more than one place are tested, not trusted.** `backend/src/__tests__/keepInStep.test.ts`
  fails when a file the nginx service mounts on its own (`nginx/nginx.conf`,
  `nginx/locations.conf`, `nginx/trusted-proxies.envsh`, read from the
  service's volumes) changes without `NGINX_CONF_STAMP` in
  `docker-compose.yml` being set to the value it prints (their hash, which
  is what makes an upgrade recreate the web server), and when the PostgreSQL
  client the backend image installs is older than the server image the compose
  files and CI pin, when any line in either Dockerfile that installs it names the
  unpinned `postgresql-client`, or when the stage that runs (the last one) does
  not install it. It also fails when `backend/scripts/restore.sh`
  stops ending its load with the statements the dashboard restore ends it with,
  when the combat state's fields differ between the two packages, when the
  special characters a password needs differ between the browser and the
  server, when the email address check differs between them (the body of
  `isValidEmail` in the browser against `validateEmail` on the server, and
  `MAX_EMAIL_LENGTH` in each), when the map limits file
  (`backend/src/validators/mapLimits.ts`, copied as
  `frontend/src/constants/mapLimits.ts` for the map dialogs) differs between
  the two, when the character sheet limits file
  (`backend/src/validators/game-systems/sheetLimits.ts`, copied as
  `frontend/src/constants/sheetLimits.ts` for the sheet editors) differs
  between the two, when the upload limits file for an asset's name,
  description and tags (`backend/src/validators/assetLimits.ts`, copied as
  `frontend/src/constants/assetLimits.ts` for the Upload Asset dialog)
  differs between the two, when the Invite Player search limits file
  (`backend/src/validators/inviteSearchLimits.ts`, copied as
  `frontend/src/constants/inviteSearchLimits.ts` for the Invite Player
  dialog) differs between the two or the dialog writes either number itself,
  when the creature and stat block limits file
  (`backend/src/validators/statBlockLimits.ts`, copied as
  `frontend/src/constants/statBlockLimits.ts` for the Creature Library, Token
  Templates and stat block editor) differs between the two, when the token
  condition limits file (`backend/src/validators/tokenLimits.ts`, copied as
  `frontend/src/constants/tokenLimits.ts` for the token editor's condition
  box) differs between the two, when the campaign limits file
  (`backend/src/validators/campaignLimits.ts`, copied as
  `frontend/src/constants/campaignLimits.ts` for the campaign dialogs)
  differs between the two, when the upload types file
  (`backend/src/validators/uploadTypes.ts`, copied as
  `frontend/src/constants/uploadTypes.ts` for the Upload Asset dialog)
  differs between the two,
  when a flood ceiling in the WebSocket guide's table
  (`backend/docs/WEBSOCKET_DOCUMENTATION.md`) differs from the one the server
  applies (`SOCKET_CEILINGS` in `backend/src/websocket/shared.ts`), when
  `campaign.access.revoked` has different fields or reasons on the two sides,
  when `tokenCentre.ts` differs between them, when a `SESSION_SECRET=`
  example in an example file or a guide would start a production server,
  when the themes and fonts the server accepts differ from those the app
  offers, when the `DATABASE_URL` block differs between
  `backend/scripts/backup.sh` and `restore.sh`, when the kinds of thing that
  can use an asset differ between the two sides or the API document, when
  either image's `.dockerignore` lets an env file other than `.env.example`
  into its build, when a Dockerfile stage runs `npm ci` or `npm install`
  before it copies the project's `.npmrc`, and when the Node.js major
  differs between `.nvmrc`, a Dockerfile stage, a CI job, an `engines`
  field, either project's `@types/node` and the guides.
- **What the guides claim is tested where a claim once drifted.**
  `backend/src/__tests__/documentedFacts.test.ts` checks the guides' own
  statements against the code and the shipped files: the deployment guide's
  Let's Encrypt, HSTS, SMTP and nginx steps, the entity diagram and the
  middleware list in `docs/ARCHITECTURE.md`, the files the RBAC reference
  names, the counts in the schema documents, the branches and seed data this
  guide names, and others. `deploymentDefaults.test.ts` checks what the
  shipped deployment files offer. Change a claim and its check together.
- **The tests drive the server's own app.** `createApp` in
  `backend/src/app.ts` puts every middleware, gate, router and error handler
  in order; `server.ts` builds its app with it and starts it, and the
  integration tests' app (`src/__tests__/helpers/test-app.ts`) is built with
  it too. The test app differs in three settings only: sessions kept in
  memory, no general request limit, and no setup gate. So a security header,
  gate or router moved or dropped in `app.ts` fails the suites;
  `src/__tests__/appAssembly.e2e.test.ts` checks the headers, the session
  cookie and the order. Mount nothing in `server.ts` itself.
- **Every route has a test, or is listed as not having one.**
  `backend/src/routes/__tests__/routeInventory.test.ts` reads every method and
  path from the app `createApp` builds. It fails when a route is in neither of
  its two lists: `TESTED`, which names a test file that sends a request to the
  route, and `UNTESTED`, the known gaps, which should only shrink. It also
  fails when a test file sends a request to a route still listed in
  `UNTESTED`, so the list cannot go on claiming a gap that has closed. Add a
  new route's test, then its line in `TESTED`.
- **The route tests read Express's router stack through one helper.**
  `backend/src/__tests__/helpers/routeInventory.ts` walks `app.router.stack`
  for the route inventory, the limiter wiring, the campaign role guards, the
  admin routes and the app assembly tests. Express 5's layers do not keep the
  path a router was mounted at, so the helper wraps `app.use` to note it, and
  a test file has to import the helper before it builds the app.
  `backend/src/__tests__/routeInventoryHelper.test.ts` compares what the
  helper reads, every route with its handlers by name and every layer of the
  app, with `helpers/routeInventory.expected.json`. After adding a route or
  middleware on purpose, run that test once with `WRITE_ROUTE_INVENTORY=1`
  and read the diff of the file before committing it.
- **Route paths use Express 5's syntax.** A wildcard needs a name
  (`/*splat`), an optional part goes in braces (`/:file{.:ext}`), and the
  characters `?`, `+`, `!`, `(`, `)`, `[` and `]` are refused when the app
  starts unless escaped. `app.use(handler)` with no path matches every
  request; a bare `*` is refused.
- **`req.body` is `{}` when a request sent no JSON only because
  `backend/src/middleware/bodyParsers.ts` puts it there.** Express 5 leaves
  it `undefined`, and many handlers destructure it straight away; keep that
  middleware right after the JSON parser.
- **A file the server sends from its own folders takes `SERVER_BUILT_PATH`**
  (`backend/src/utils/fileUtils.ts`) as `res.sendFile` or `res.download`
  options. Express 5 refuses a path with any folder whose name starts with a
  dot, and a self-hoster's uploads or backups folder can sit inside one;
  `hiddenStorageFolder.e2e.test.ts` serves every kind of file from such a
  folder. Never pass it for a path taken from a request.
- **Every rate limiter is tested where it is attached.**
  `backend/src/routes/__tests__/limiterWiring.e2e.test.ts` has a row per
  limited route: it sends the limit's worth of failing requests to the real
  route and expects the next to be answered 429. It also reads the routers
  and fails when a route carries a limiter with no row, so a newly limited
  route needs one line in its `ROWS`. The server-wide limit on every `/api`
  request is mounted by `createApp` ahead of every router; the same file
  checks it is there and fires it.
- **A limiter key that uses the client address passes it through
  `ipKeyGenerator`.** express-rate-limit 8 counts an IPv6 client by its /56
  network, and a custom `keyGenerator` that reads `req.ip` must call
  `ipKeyGenerator` from the same package to do the same; otherwise the library
  logs `ERR_ERL_KEY_GEN_IPV6` once and each address in the network gets its own
  allowance. `backend/src/middleware/__tests__/rateLimitValidation.test.ts`
  makes every express-rate-limit limiter, sends a request through each, and
  fails on anything the library writes to the console; add a new limiter to
  its list. The wrong-answer limiter (`backend/src/middleware/failureLimiter.ts`)
  keys an address with `ipKeyGenerator` too, so a test that mocks
  express-rate-limit keeps the rest of the package real with
  `jest.requireActual`.
- **A test file may not carry a `TODO(test)` marker.** A test known to be
  flaky or wrong once sat behind one, assigned to nobody, until it failed a
  release's CI run. `backend/src/__tests__/testMarkers.test.ts` scans the test
  files of both packages and fails on the marker, so fix the test or open an
  issue for it. Markers for other areas (`TODO(maps)`, `TODO(ui)`) are fine
  in a test.
- **The doc checks are gates, not formalities.** `spec-coverage.py` compares
  `backend/docs/API_DOCUMENTATION.yaml` against the routes the server actually
  mounts and fails when they disagree in either direction, and loads the file
  as YAML when PyYAML is installed (`pip install pyyaml`; CI installs it), since
  the route check does not care whether the file loads and three unquoted
  colons once made it unloadable. It also fails when a request the
  frontend's API client sends is not in the file, and when
  `docs/API_REFERENCE.md` describes a route that does not exist;
  `websocket-events.py --check` regenerates the WebSocket event table from
  the handlers and fails on any difference from the one in the doc, a
  changed permission column included. Regenerate that table with
  `python3 scripts/websocket-events.py --write`. Both fail on a route or
  event declared in a form they cannot read, so nothing is left out of them
  unnoticed; `python3 -m unittest discover -s scripts/tests` tests that, and
  tests `nginx-check.py` and `coverage-summary.py` too.

`.github/workflows/ci.yml` runs the same commands on pushes to `dev` and `main`
and on pull requests into them (a push to any other branch runs nothing). It
also does what self-hosters run and a developer usually does not:

- **Compares `schema.prisma` with the migrations** (`prisma migrate diff
  --exit-code`, against an empty shadow database), so a schema change with no
  migration fails, then applies the migrations to an empty database before
  the backend tests. To run the comparison yourself, give it a database of
  its own, which Prisma empties: the command is in the workflow, and the
  scratch database is the one "Running Migrations" above creates, named by
  `SHADOW_DATABASE_URL`.
- **Collects test coverage** in both projects and shows it in the job
  summary, per folder under `src/`. A report only: no threshold fails yet.
- **Builds both production images** with `docker compose build`, after
  reading `docker-compose.yml` with the example settings, then starts the
  stack and runs the browser smoke tests against it (see Browser smoke tests
  above).
- **Checks the bundled nginx's configuration** with
  `python3 scripts/nginx-check.py`: it renders `nginx/nginx.conf` with the
  image's own entrypoint, the environment and mounts `docker-compose.yml`
  gives the container and `nginx/trusted-proxies.envsh`, and has nginx check
  it three ways: as shipped, with `NGINX_TRUSTED_PROXIES` set, and with the
  HTTPS example from `docs/DEPLOYMENT.md` and a throwaway certificate whose
  key only the account running the check may read, as the guide's steps
  leave a real one. The container gets the same capabilities,
  `no-new-privileges`, read-only filesystem and tmpfs folders as the
  service, so a capability the start needs and the file lacks fails here. It
  needs Docker, openssl and PyYAML, and runs locally too.
- **Checks known advisories** in the packages an instance runs
  (`npm audit --omit=dev --audit-level=high` in both projects): a high or
  critical one fails the job. A last step lists the advisories in each
  project's developer tools too, and fails nothing, since those never reach
  an instance. Each of these steps runs whatever the ones before it found,
  so a failing backend audit still shows the frontend's result.
  When a package an instance runs asks for a dependency at a version with
  a high advisory, or a developer tool asks for one with any advisory, and
  no release of that package asks for a fixed one yet, that project's
  `package.json` holds the dependency at a fixed version under `overrides`,
  naming the package that asks for it. `keepInStep.test.ts`
  fails once an update of that package asks for the held version or a newer
  one, which is when the override has to go.

Every action the workflow uses is pinned to a commit, with its version in a
comment, and `.github/dependabot.yml` asks for a weekly pull request into
`dev` for each project's minor and patch updates (grouped), the actions and
the Docker base images. Each major version of an npm package comes as a pull
request of its own, since it can change behaviour. The packages and versions
that wait are named under `ignore`, each with a comment giving the reason and
when to remove the entry: TypeScript 7 and TypeScript 6.1 (until
typescript-eslint accepts it) among them, and `@types/node`, which
moves with the Node major. Node and nginx move to a new
major or stable line by hand, and PostgreSQL's major version never through
Dependabot, since its data has to be dumped and restored. A new release
waits before Dependabot proposes it (`cooldown`): an npm package 3 days for a
patch, 7 for a minor and 14 for a major, an action or base image 7 days, so
a hijacked publish is usually pulled first. Security updates do not wait.
Dependabot alerts for published advisories are on. Its automatic security pull requests are
turned on in the repository's settings once 1.5.3 is on `main`; GitHub opens
those against `main` whatever `target-branch` says.

A pull request into `main` cannot merge until the Frontend, Backend, Docs,
Dependency advisories, and Production images, nginx and smoke tests jobs pass
(a ruleset in the repository's settings). Pushes to `dev` are not blocked: CI
reports there.

### Before a release: rehearse the upgrade

The suites run against an empty test database. None of them upgrades an
instance that already holds data, and none loads a backup into a real
PostgreSQL with `psql`: they check the file `psql` is handed and the
arguments it runs with, because the suites run where the client tools need
not be installed. Self-hosters upgrade with `git pull` and
`docker compose up -d --build` and nothing else, so before a release is
tagged, rehearse exactly that:

1. In a second checkout (`git worktree add ../cozy-rehearsal <previous-tag>`),
   copy `.env.example` to `.env`, give it ports of its own (`HTTP_PORT`,
   `HTTPS_PORT`) and its own secrets, and start the production stack with
   `docker compose up -d --build`. Its containers are named `cozyvtt-*`, like
   a real instance's, so do this on a machine that is not running one.
2. Seed it through the app: an admin, a player with two-factor sign-in on,
   a campaign with a lit map (walls, a light, a hidden token with notes, some
   revealed fog) and a character; then make a backup from the Admin Dashboard
   and one with `./backend/scripts/backup.sh`.
3. Record a fingerprint of the data with `psql` in the database container:
   an `md5` of each map's tokens, walls, lights and fog, of each character's
   data, and each user's two-factor state, with the row counts.
4. Check out the release commit in the same folder and run
   `docker compose up -d --build`, as a self-hoster would.
5. Check that the migrations applied (`docker compose logs backend`), the
   fingerprints are unchanged, `/health` answers through the bundled nginx,
   the old passwords still sign in, the player is sent nothing the DM hid,
   the previous release's dashboard backup restores on the new code, a new
   backup downloads and restores, and `backup.sh` then `restore.sh` work.
6. Open the campaign in a browser as the DM and as the player.

Take the rehearsal down afterwards with `docker compose down -v` in that
checkout, which deletes its database, and `git worktree remove`.

---

## Code Style

### TypeScript

Both backend and frontend use TypeScript in **strict mode**. The `tsconfig.json`
in each package enables `strict: true`, which brings `noImplicitAny`,
`strictNullChecks` and the rest with it.

The frontend has three settings files, all strict, and `npm run typecheck`
checks each: `tsconfig.json` for the app, `e2e/tsconfig.json` for the smoke
tests, and `tsconfig.node.json` for `vite.config.ts` and `vitest.config.ts`.
Those two run in Node, so only they see Node's types (`@types/node`, held to
the Node major like the backend's); the app's code sees the browser's.

Both packages use TypeScript 6.0 (`~6.0.3` in each `package.json`), since
typescript-eslint supports TypeScript below 6.1 and ts-jest below 7. Neither
`tsconfig.json` sets `ignoreDeprecations`: they use none of the options
TypeScript 6 deprecates, such as `baseUrl` or `"moduleResolution": "node"`,
and a deprecated option fails the type check.

The backend compiles with `"module": "node20"` and `"moduleResolution":
"node16"`, Node's own module rules. Its `package.json` has no `"type"`, so
every file is CommonJS and `dist/` stays CommonJS; the compiler reads each
package's `"exports"`, and the code can import the packages published only as
ES modules (archiver, file-type), which Node 22.12 and later load
with `require` (the images run Node 26). `"module": "node16"` refuses those imports. Two things follow:

- **No dynamic `import()` of our own files.** Under these settings an
  `import()` stays a native ES module import, which fails in `dist/` and
  under ts-node, and the type check refuses one without a file extension.
  Application code imports statically. A test that must load a module late, after setting
  `DATABASE_URL` or calling `jest.resetModules()`, uses
  `require('../x') as typeof import('../x')`.
- **The global types are listed.** `"types": ["node", "jest"]` in
  `backend/tsconfig.json` names the `@types` packages every file sees; any
  other comes in when a file imports it.

ts-jest compiles the tests as CommonJS whatever the module setting, finding
each package's types through its `"exports"` as the type check does, and
warns about `node20` on every file, so `backend/jest.config.js` turns that one
warning (151002) off.

`noUncheckedIndexedAccess` is **not** enabled in either package. It is worth
turning on one day, but it is its own burn-down and mixing it into other work
would make it impossible to say what caused a regression.

**No `any`.** `@typescript-eslint/no-explicit-any` is an **error** in both
packages, not a warning, and it applies to every file, tests included. There is
no allowlist; do not add one. When a type resists, reach for `unknown` plus a
narrowing helper — `frontend/src/utils/errors.ts` and
`backend/src/utils/prisma-json.ts` exist for the two common cases. A test double
that is partial on purpose, such as a mock Express request, is built as a plain
object and cast once through `unknown` to the type it stands in for.

### Linting

**Both** packages have ESLint, and both run with `--max-warnings 0`:

```bash
cd backend && npm run lint
cd frontend && npm run lint
```

The rules are in each package's `eslint.config.js` (ESLint 10, flat config):
ESLint's recommended rules from `@eslint/js`, the recommended rules of the
`typescript-eslint` package (which brings its parser and plugin with it) and,
in the frontend, the React hooks rules. Only TypeScript files are linted, apart from
the frontend's `vite.config.ts`. A rule that is switched off says why beside
it. In the frontend the ones waiting to be turned on are marked
`TODO(ratchet)`; the backend's three are listed in the comment above them.

There is no enforced code formatter (Prettier), but follow the existing style in the file you're editing:
- 2-space indentation
- Single quotes for strings
- Trailing commas in multi-line arrays/objects

### Backend Patterns

- **Routes** handle HTTP parsing and response formatting only — business logic goes in `services/`
- **Middleware** in `src/middleware/` — authentication and role guards (named in the route declaration, composed in `compose.ts`), rate limiting, file uploads
- **Validators** in `src/validators/` use Zod schemas; validate at the route level with `schema.safeParse(req.body)` and answer `400` with the first issue's message when it fails. A key that may be left out says `.optional()`, a `z.unknown()` key included: since zod 4.4 a missing `z.unknown()` key is an error
- **WebSocket handlers** in `src/websocket/handlers/` — one module per domain (tokens, dice, chat, fog, …), each registering its events for a connection; `events.ts` handles the connection itself (joining a campaign, presence, disconnect) and registers the domain modules

### Frontend Patterns

- **Pages** in `src/pages/` — one file per route, thin orchestration layer
- **Components** in `src/components/` — reusable UI; they reach the API through the clients in `src/services/` (the document reader's `fetch` of a document's text is the one exception)
- **Contexts** in `src/contexts/` — global state (Auth, WebSocket, Campaign, Theme, Toast)
- **Services** in `src/services/` — all API calls go through `api.ts` or `auth.service.ts`
- **No `any`** — if you need to escape the type system, use `unknown` and narrow it

### Naming Conventions

| Thing | Convention | Example |
|-------|-----------|---------|
| Files | Components, pages and contexts: PascalCase, named for what they export. Hooks: `useThing.ts`. Backend modules and other helpers: camelCase, with a few older kebab-case names (`dice-parser.ts`). Tests: `name.test.ts` beside the code or in `__tests__/` | `CampaignCard.tsx`, `useMapControls.ts`, `campaignMacros.ts` |
| React components | PascalCase | `CampaignCard` |
| Functions / variables | camelCase | `fetchCampaigns` |
| Types / Interfaces | PascalCase | `CampaignCardProps` |
| Constants | UPPER_SNAKE_CASE | `MAX_FILE_SIZE` |
| Database models | PascalCase | `Campaign` |
| API route paths | kebab-case | `/api/character-templates` |

---

## Git Workflow

### Branches

- `main` — what self-hosters pull; it holds releases only
- `dev` — where work lands: start each change on a branch off `dev` and merge it back there
- `feat/<name>` — new features
- `fix/<name>` — bug fixes
- `docs/<name>` — documentation only
- `test/<name>` — tests and CI only
- `chore/<name>` — version bumps and other housekeeping
- `release/<version>` — a release being tested, cut from `dev`

CI runs on pushes to `dev` and `main` and on pull requests into them; a branch of your own runs nothing until it is pushed as a pull request.

### Commit Messages

Use the imperative mood, present tense:

```
Add initiative tracker to campaign page
Fix token position not persisting after map switch
Update README with Docker instructions
```

For larger changes, use a short subject and a body:

```
Add spirit layer token visibility filtering

Server now filters spirit tokens per-client when broadcasting map.changed.
Players only receive tokens they have permission to see based on their
current layer and crossover status.
```

### Contributing

CozyVTT does not accept cold Pull Requests. If you'd like to contribute to the official project, please read [CONTRIBUTING.md](CONTRIBUTING.md) first.
