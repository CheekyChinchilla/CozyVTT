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
| Node.js | 20.x | Use `nvm` or `fnm` to manage versions |
| PostgreSQL | 14+ | Or use the Docker Compose stack |
| npm | 10+ | Comes with Node.js 20 |
| Docker + Docker Compose | Any recent | Optional — needed for the containerized setup |

---

## Repository Structure

```
cozyvtt/
├── backend/               Express API server
│   ├── src/
│   │   ├── config/        Configuration loading and validation
│   │   ├── game-systems/  Game system type definitions
│   │   ├── middleware/     Auth, rate limiting, upload middleware
│   │   ├── routes/        Express route handlers
│   │   ├── services/      Business logic layer
│   │   ├── types/         Shared TypeScript types
│   │   ├── utils/         Helpers (dice parser, asset URLs, etc.)
│   │   ├── validators/    Zod validation schemas
│   │   └── websocket/     Socket.io event handlers
│   ├── prisma/
│   │   ├── schema.prisma  Database schema
│   │   ├── migrations/    Migration history
│   │   └── seed.ts        Development seed data
│   └── docs/              Backend-specific docs (OpenAPI YAML, WS docs)
│
├── frontend/              React + Vite client
│   ├── src/
│   │   ├── components/    Reusable UI components (incl. ui/ primitives)
│   │   │   └── character-sheets/  Game system sheet components
│   │   ├── contexts/      React context providers (Auth, WebSocket, Campaign)
│   │   ├── stores/        Zustand store for live session state
│   │   ├── hooks/         Custom React hooks (incl. queries/ for React Query)
│   │   ├── lib/           React Query client setup
│   │   ├── pages/         Top-level page components
│   │   ├── services/      API and Socket.io client wrappers
│   │   ├── styles/        Global CSS and effect stylesheets
│   │   ├── types/         TypeScript type definitions
│   │   └── utils/         Client-side helpers
│   └── public/            Static assets
│
├── docs/                  User and developer documentation
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
| `SESSION_SECRET` | Yes | — | Random string for session signing (32+ chars) |
| `NODE_ENV` | Yes | `development` | `development` or `production` |
| `PORT` | No | `4000` | Port the API server listens on |
| `CORS_ORIGIN` | No | `http://localhost:3000` | Allowed origin for CORS |
| `SMTP_HOST` | No | — | SMTP server hostname |
| `SMTP_PORT` | No | `587` | SMTP server port |
| `SMTP_USER` | No | — | SMTP login username |
| `SMTP_PASS` | No | — | SMTP login password |
| `SMTP_FROM` | No | — | From address for outbound email |
| `SMTP_SECURE` | No | `false` | Use TLS (`true`) or STARTTLS (`false`) |
| `APP_URL` | No | — | Public URL used in email links |
| `MAX_MAP_SIZE_MB` | No | `50` | Upload size limit for map images |
| `MAX_TOKEN_SIZE_MB` | No | `5` | Upload size limit for token images |
| `MAX_AUDIO_SIZE_MB` | No | `20` | Upload size limit for audio files |
| `MAX_AVATAR_SIZE_MB` | No | `2` | Upload size limit for avatar images |
| `NGINX_MAX_BODY_SIZE` | No | `55M` | Request body cap for the bundled Nginx (`client_max_body_size`); must cover the largest limit above |
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

### Frontend (`frontend/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_API_URL` | No | (relative) | Backend API URL (leave empty to use Vite proxy in dev) |
| `VITE_SOCKET_URL` | No | (relative) | WebSocket server URL (leave empty to use Vite proxy in dev) |
| `VITE_ALLOWED_HOSTS` | No | — | Comma-separated allowed hostnames for the Vite server |

In development, leave both `VITE_API_URL` and `VITE_SOCKET_URL` **empty** — the Vite dev server proxies `/api` and socket connections to `http://localhost:4000` automatically.

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

### 2. Set up PostgreSQL

Create a database and user:

```sql
CREATE DATABASE cozyvtt;
CREATE USER cozyvtt WITH PASSWORD 'cozyvtt';
GRANT ALL PRIVILEGES ON DATABASE cozyvtt TO cozyvtt;
```

### 3. Configure environment

```bash
cp backend/.env.example backend/.env
# Edit backend/.env with your DATABASE_URL and secrets
```

### 4. Run database migrations

```bash
cd backend
npx prisma migrate dev
```

### 5. (Optional) Seed the database

```bash
cd backend
npm run prisma:seed
```

This creates a sample admin account and some test data. Check `prisma/seed.ts` for the credentials.

---

## Local Setup (With Docker)

> ⚠️ **This section is for local development only.** The command below runs the **dev stack** (`docker-compose.dev.yml`), which intentionally exposes the database to localhost, runs the backend under nodemon with verbose logging, and runs the frontend under Vite's dev server with hot module replacement. **Do not use this for a public deployment.** For production, use the plain `docker-compose.yml` and follow **[DEPLOYMENT.md](./DEPLOYMENT.md)**.

```bash
# Copy the root .env template
cp .env.example .env
# Edit .env — at minimum set DATABASE_PASSWORD, SESSION_SECRET

# NOTE: the -f flag is REQUIRED. Without it you'll start the production stack.
docker compose -f docker-compose.dev.yml up
```

Services (all exposed on localhost for easy debugging):
- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:4000`
- PostgreSQL: `localhost:5432`

The backend container runs `npm run dev` (nodemon with hot reload). The frontend container runs `vite` with hot module replacement. Migrations run automatically on first start via Prisma.

### Production vs Development at a glance

| | Production (`docker-compose.yml`) | Development (`docker-compose.dev.yml`) |
|---|---|---|
| Backend | Compiled JS, no source on disk | Source mounted, nodemon |
| Frontend | Pre-built static files via Nginx | Vite dev server with HMR |
| Database port | **Not exposed to host** | Exposed on `localhost:5432` |
| Backend port | **Not exposed to host** | Exposed on `localhost:4000` |
| Public entry | Nginx reverse proxy on 80/443 | Direct ports per service |
| Logging | JSON, written to disk | Pretty-printed, console |
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

# Apply migrations in CI / production (no prompts)
npx prisma migrate deploy
```

### Exploring the Database

Prisma Studio is a web-based database browser:

```bash
cd backend
npm run prisma:studio
# Opens http://localhost:5555
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
cd backend
npm run build
# Output in backend/dist/
node dist/server.js
```

See [docs/DEPLOYMENT.md](DEPLOYMENT.md) for full production deployment instructions.

---

## Running Tests

### Backend Tests (Jest)

```bash
cd backend
npm test                  # Run all tests
npm run test:watch        # Watch mode
npm run test:coverage     # Generate coverage report
```

Tests live in `backend/src/**/__tests__/`. Unit tests use Jest; integration tests use Supertest against an in-process server.

> **Note:** Integration tests require a running PostgreSQL database. Set `DATABASE_URL` in your test environment. Test data is cleaned up after each suite.

### Frontend Tests (Vitest)

```bash
cd frontend
npm test                  # Interactive watch mode
npm run test:run          # Run once (CI mode)
npm run test:coverage     # Generate coverage report
```

Tests live alongside the components they test in `__tests__/` subdirectories or as `.test.tsx` files.

### Type Checking

```bash
# Backend
cd backend && npx tsc --noEmit

# Frontend
cd frontend && npm run typecheck
```

---

## Code Style

### TypeScript

Both backend and frontend use TypeScript in **strict mode**. The `tsconfig.json` in each package enables:
- `strict: true` (includes `noImplicitAny`, `strictNullChecks`, etc.)
- `noUncheckedIndexedAccess`

### Formatting

The project uses ESLint for linting. Run:

```bash
cd frontend
npm run lint
```

There is no enforced code formatter (Prettier), but follow the existing style in the file you're editing:
- 2-space indentation
- Single quotes for strings
- Trailing commas in multi-line arrays/objects

### Backend Patterns

- **Routes** handle HTTP parsing and response formatting only — business logic goes in `services/`
- **Middleware** in `src/middleware/` — authentication, rate limiting, file uploads
- **Validators** in `src/validators/` use Zod schemas; validate at the route level with `schema.parse(req.body)`
- **WebSocket handlers** in `src/websocket/events.ts` — one handler per socket event namespace

### Frontend Patterns

- **Pages** in `src/pages/` — one file per route, thin orchestration layer
- **Components** in `src/components/` — reusable UI; no direct API calls
- **Contexts** in `src/contexts/` — global state (Auth, WebSocket, Campaign)
- **Services** in `src/services/` — all API calls go through `api.ts` or `auth.service.ts`
- **No `any`** — if you need to escape the type system, use `unknown` and narrow it

### Naming Conventions

| Thing | Convention | Example |
|-------|-----------|---------|
| Files | kebab-case | `campaign-card.tsx` |
| React components | PascalCase | `CampaignCard` |
| Functions / variables | camelCase | `fetchCampaigns` |
| Types / Interfaces | PascalCase | `CampaignCardProps` |
| Constants | UPPER_SNAKE_CASE | `MAX_FILE_SIZE` |
| Database models | PascalCase | `Campaign` |
| API route paths | kebab-case | `/api/campaign-invitations` |

---

## Git Workflow

### Branches

- `main` — production-ready code; protected
- `develop` — integration branch for features
- `feature/<name>` — new features
- `fix/<name>` — bug fixes
- `docs/<name>` — documentation only

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
