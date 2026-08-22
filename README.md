<p align="center">
  <img src="assets/default-logo.png" alt="CozyVTT Logo" width="300" />
</p>

<p align="center">
  <a href="https://cozyvtt.com">cozyvtt.com</a>
</p>

A self-hosted, browser-based Virtual Tabletop (VTT) platform. Designed for ease of use and narrative-driven tabletop RPG campaigns where atmosphere matters more than mechanics.

> **Self-hosted** — you own your data. One instance can host multiple concurrent campaigns run by different GMs for different player groups.

---

## ⚠️ Self-Hosted Reality Check

CozyVTT is a self-hosted, community-maintained project run **by you** on **your hardware**. It is provided as-is, with no warranty, no SLA, and no central support — see the [AGPL-3.0 License](LICENSE) for the legal version of this.

**You are responsible for the security and uptime of your instance.** We do our best (Argon2id passwords, MFA, magic-byte file validation, per-endpoint rate limiting, non-root Docker containers, etc. — see [SECURITY.md](SECURITY.md) for the full list), but the operating environment is yours.

**Recommended deployment posture** for a public-facing instance:

- Run on a small VPS rather than your home network
- Front it with a **[Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)** (free, hides your origin IP, no open ports needed, automatic DDoS protection) or a similar reverse proxy / WAF
- Keep the instance updated as security patches land — watch this repo
- Set a strong `SESSION_SECRET` (32+ char random) — the production build refuses to start with a placeholder
- Use the built-in MFA on the admin account at minimum
- Configure regular database backups (`backend/scripts/backup.sh` + cron — see [DEPLOYMENT.md](docs/DEPLOYMENT.md))
- Review the **Hardening Checklist** in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) before flipping public

If those words mean nothing to you, run CozyVTT **only on your local network** (e.g. via a Tailscale node, ZeroTier, or just LAN-accessible) until you've leveled up your sysadmin chops. That's a perfectly valid way to play — your campaigns aren't worse for being LAN-only, and you skip the whole attack-surface conversation.

If you find a security issue, please report it privately per [SECURITY.md](SECURITY.md) rather than filing a public issue.

---

## Features

### Platform
- **Multi-campaign** — one server, unlimited campaigns, isolated from each other
- **Role-based access control** — Platform Admin, Campaign DM, Player, and Spectator roles
- **Setup wizard** — guided first-run initialization; no manual database seeding required
- **Admin dashboard** — user management, system settings, activity logs, database backups

### Campaign Tools
- **Interactive map canvas** — upload map images, place tokens, drag to move in real time
- **Token system** — player, NPC, and object token types with disposition (friendly/neutral/hostile), HP bars, conditions, stat blocks, and notes; three display modes (pog, top-down, full-art); colored-letter placeholders for tokens without images
- **Creature library** — browse, search, and place creatures from the SRD bestiary (auto-imported from Open5e) or custom campaign-specific templates; per-campaign favorites with star toggle; duplicate SRD creatures to customize; edit custom creatures in-place; save token images back to templates
- **Token templates** — save reusable token configurations (image, stats, HP, size, disposition, full NPC stat block); place from library or save from map context menu; copy templates between campaigns the DM owns
- **NPC right-click rolls** — DMs right-click any NPC token to roll abilities, saves, skills, attacks, and damage parsed from its stat block; advantage/disadvantage selector for d20 systems; free-form custom roll fallback for non-5e systems
- **Campaign export/import** — export campaigns as portable `.cozyvtt` archives; import on any CozyVTT instance; includes maps, tokens, creatures, templates, and assets; multi-step preview flow; optional audio toggle; secured against path traversal, zip bombs, and malicious files
- **Walls & dynamic lighting** — DM-drawn wall segments (walls, doors, windows) with raycasting visibility; draw, polygon, and brush drawing modes; snap-to-grid and snap-to-endpoint; split, select, erase, and merge point tools; snap-to-wall door/window placement (auto-splits existing walls); players only see what their character can; door interactions for both DM and players; bright/dim light radii matching D&D 5e and PF2e rules; named light presets (Candle, Torch, Lamp, Lantern, Campfire); overlapping dim zones combine to bright
- **Fog of war** — DM-controlled fog brush reveals the map square by square; animated fade transitions
- **Spirit layer** — a second canvas layer for ethereal / astral / out-of-body scenes, hidden from players by default
- **Initiative tracker** — real-time combat turn order; DM controls, players watch live. The acting token is ringed on the map for everyone, and hovering a name highlights its token (and vice versa)
- **Map pings** — press Tab to mark a spot for the whole table; a dot with radiating rings in your own colour, labelled with your name
- **Vibe tracker** — time-of-day atmosphere presets with custom color filters and ambient audio
- **Ambient atmosphere** — six visual effects (rain, mist, leaves, sparkles, snow, wind) and ambient audio independently per campaign
- **Session management** — start, pause, resume, and end sessions with full state capture (token positions, map, vibe)
- **Resizable session workspace** — drag to resize or collapse the roster, map, and side panels; a tabbed sidebar keeps Chat, Dice, and Initiative full-height, with an unread-message badge; layout persists per browser

### Character Sheets
- **D&D 5th Edition** — full sheet with stats, skills, saving throws, attacks, spells, inventory
- **Pathfinder 2nd Edition** — attributes, saves, perception, skills, lore skills, strikes
- **Call of Cthulhu 7th Edition** — characteristics, skills, weapons, sanity, luck
- **Flexible / Custom** — JSON-based freeform character sheets for any system

### Dice System
- **Full dice notation** — `1d20+5`, `2d6`, `4d6kh3` (keep highest), advantage/disadvantage
- **Real-time results** — rolls appear in the campaign chat log for all players
- **Secret rolls** — rolled result visible only to you and the DM
- **Dice history** — scrollable log of all session rolls

### Communication
- **Campaign chat** — in-session messaging between all members
- **System messages** — automatic logs for joins, session events, and dice rolls

### Theming & Customization
- **16 built-in color themes** — warm, cool, dark, neutral, and vibrant palettes
- **Per-user themes** — each account picks its own theme and font from the profile page; preferences persist across logout/login
- **Custom theme** — pick primary, accent, background, and text colors to create a unique look
- **8 font families** — open-source Google Fonts including medieval, elegant, modern, handwritten, and scholarly options
- **Live preview** — theme and font changes preview instantly before saving
- **Default theme** — admin selects the theme shown on the login page and applied to brand-new users
- **Custom branding** — the instance logo, mascot, and favicon can be replaced (swap the images in `frontend/public/` before building; an admin upload UI is [planned](docs/FUTURE_FEATURES.md))

### Security
- **Argon2id password hashing** (64 MB memory cost, timeCost 3)
- **TOTP multi-factor authentication** with hashed backup codes
- **Session-based authentication** with rolling expiry and "remember me"
- **Password reset** via email (SMTP configurable)
- **Admin-approval registration** (optional)
- **File upload validation** — magic-byte content checks (not just MIME header), size limits by type
- **Per-endpoint rate limiting** — global API limit, strict auth limit, asset upload limit (configurable via `ASSET_UPLOAD_RATE_LIMIT`)
- **WebSocket campaign isolation** — server-authenticated campaign membership; no client-spoofing
- **Production refuses to start** with a placeholder `SESSION_SECRET`
- See [SECURITY.md](SECURITY.md) for the vulnerability disclosure policy

---

## Game Systems

| System | Character Sheet | Status |
|--------|----------------|--------|
| D&D 5th Edition | Full | Available |
| Pathfinder 2nd Edition | Full | Available |
| Call of Cthulhu 7th Edition | Full | Available |
| Flexible / Custom | JSON freeform | Available |
| Shadowrun 6th Edition | — | Planned |

---

## Tech Stack

**Backend**
- Node.js + Express + TypeScript (strict mode)
- PostgreSQL 15 + Prisma ORM
- Socket.io for real-time WebSocket events
- Argon2id password hashing
- Multer + Sharp for file uploads and thumbnail generation
- Nodemailer for transactional email
- Zod for runtime request validation
- Jest for testing

**Frontend**
- React 18 + TypeScript (strict mode)
- Vite build tooling
- Tailwind CSS with custom design tokens
- Zustand for live session state; TanStack Query (React Query) for REST data
- Socket.io client
- Axios for REST API calls
- react-resizable-panels for the session workspace
- Framer Motion for animations (reduced-motion aware)
- Vitest + Testing Library

---

## Quick Start

### Requirements

- Node.js 20+
- PostgreSQL 14+
- A modern browser (Chrome, Firefox, Edge, Safari)
- SMTP server (optional — required for password reset and invitation emails)

### Docker (Recommended)

```bash
git clone https://github.com/CheekyChinchilla/CozyVTT.git
cd CozyVTT

# Copy and fill in your environment variables
cp .env.example .env

# Production stack (hardened, what end-users run)
docker compose up -d --build
```

Navigate to `http://localhost` and complete the setup wizard.

### Local Development

If you've cloned the repo to hack on CozyVTT itself, use the dev compose file instead — it enables hot reload, exposes the backend port directly, and runs `NODE_ENV=development`:

```bash
docker compose -f docker-compose.dev.yml up
```

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for the full dev setup (including running outside Docker).

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for production deployment with Nginx and SSL.

---

## Configuration

All runtime configuration is managed through the Admin dashboard after setup:

| Tab | Setting | Description |
|-----|---------|-------------|
| Users | Invite User | Email someone a link to join and choose their own password (needs SMTP; link valid 7 days) |
| Users | Create User | Generate a temporary password to hand over yourself — for instances without email |
| Settings | Instance Name | Displayed in the browser title and emails |
| Settings | Allow Registration | Whether new users can self-register |
| Settings | Require Admin Approval | New registrations must be approved before login |
| Settings | Timezone | Server timezone for session timestamps |
| Settings | SMTP | Email server settings (test via the dashboard) |
| Settings | Upload Limits | Per-type file size limits (maps, tokens, audio, avatars) |
| Appearance | Default Theme | Theme shown on the login page and used for new users (each user can override from their profile) |
| Appearance | Default Font | Default font family applied alongside the default theme |
| Appearance | Custom Theme | Build a palette from primary, accent, background, and text colors, with a live readability check |

However an account is added, its first sign-in ends with the person choosing their own password — an
admin-issued temporary password cannot be used for anything else.

Instance branding (logo, mascot, favicon) is **not** set from the dashboard yet — see
[Appearance & Theming](docs/USER_GUIDE.md#appearance--theming) for how to change it today.

### Default Upload Limits

| Type | Default | Environment variable |
|------|---------|----------------------|
| Map images | 50 MB | `MAX_MAP_SIZE_MB` |
| Token images | 5 MB | `MAX_TOKEN_SIZE_MB` |
| Audio files | 20 MB | `MAX_AUDIO_SIZE_MB` |
| Avatar images | 2 MB | `MAX_AVATAR_SIZE_MB` |

Set these in `.env` and restart — no rebuild needed. If you raise one, raise your reverse proxy's body limit to match (`NGINX_MAX_BODY_SIZE` for the bundled Nginx). See [Upload Size Limits](docs/DEPLOYMENT.md#upload-size-limits).

---

## User Roles

### Platform Roles
| Role | Description |
|------|-------------|
| `ADMIN` | Full platform access — manage users, campaigns, system settings |
| `USER` | Can create and join campaigns |

### Campaign Roles
| Role | Description |
|------|-------------|
| `DM` | Full campaign control — manage maps, tokens, sessions, members |
| `PLAYER` | Can view maps, move their own tokens, roll dice, chat |
| `SPECTATOR` | Read-only access — can observe but not interact |

---

## Documentation

| Document | Description |
|----------|-------------|
| [User Guide](docs/USER_GUIDE.md) | End-user guide for all platform features |
| [DM Guide](docs/DM_GUIDE.md) | DM-specific features and workflows |
| [Player Guide](docs/PLAYER_GUIDE.md) | Quick-start guide for players |
| [Development Setup](docs/DEVELOPMENT.md) | Local development guide |
| [Architecture](docs/ARCHITECTURE.md) | System architecture and design decisions |
| [Deployment](docs/DEPLOYMENT.md) | Production deployment guide |
| [Contributing](docs/CONTRIBUTING.md) | How to contribute to CozyVTT |
| [Game Systems](docs/GAME_SYSTEMS.md) | How to add new game system support |
| [API Reference](docs/API_REFERENCE.md) | REST API and WebSocket event reference |
| [WebSocket Events](backend/docs/WEBSOCKET_DOCUMENTATION.md) | Detailed Socket.io event schema |
| [Future Features](docs/FUTURE_FEATURES.md) | Backlog of planned work |
| [Security Policy](SECURITY.md) | How to report vulnerabilities |
| [Changelog](CHANGELOG.md) | Release history |
| [Third-Party Licenses](THIRD_PARTY_LICENSES.md) | Font and content license attributions |

---

## Asset Storage

Uploaded files are stored in `backend/uploads/` organized by type:

```
uploads/
  maps/        Map images and thumbnails
  tokens/      Token images and thumbnails
  audio/       Ambient audio files
  avatars/     User profile avatars
  backups/     Database backup files (pg_dump)
```

---

## License

GNU Affero General Public License v3.0 — see [LICENSE](LICENSE) for details.

CozyVTT is free to use, self-host, and fork. The AGPLv3 requires that any modified version you run as a network service must also make its source code available under the same license.

For third-party font and content licenses, see [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).
