# CozyVTT — Deployment Guide

This guide covers deploying CozyVTT to a **production server** using Docker Compose (recommended) or manually. The default `docker compose up -d --build` command in this guide runs the **hardened production stack**: compiled binaries, Nginx reverse proxy, no exposed database/backend ports.

> 🛠️ **Just want to hack on the code locally?** You're in the wrong file. See **[DEVELOPMENT.md](./DEVELOPMENT.md)** for the dev setup (hot reload, exposed ports, source-mounted volumes).

---

## Table of Contents

1. [Requirements](#requirements)
2. [Docker Compose Deployment](#docker-compose-deployment)
3. [Port Configuration](#port-configuration)
4. [Using an External Reverse Proxy](#using-an-external-reverse-proxy)
5. [SSL/TLS with Let's Encrypt](#ssltls-with-lets-encrypt)
6. [Manual Deployment](#manual-deployment)
7. [Environment Configuration](#environment-configuration)
8. [File Storage](#file-storage)
9. [Database Backups](#database-backups)
10. [Monitoring and Logs](#monitoring-and-logs)
11. [Updating CozyVTT](#updating-cozyvtt)
12. [Hardening Checklist](#hardening-checklist)

---

## Requirements

- A Linux server (Ubuntu 22.04 LTS recommended)
- Docker 24+ and Docker Compose v2
- A domain name pointing to your server's IP (optional for LAN-only use)
- At least 1 GB RAM; 2 GB recommended for comfortable operation

---

## Docker Compose Deployment

This is the recommended path. `docker-compose.yml` is the production stack: PostgreSQL, the compiled backend, the React frontend served by Nginx, and an Nginx reverse proxy that handles all public traffic.

### 1. Clone the repository

```bash
git clone https://github.com/CheekyChinchilla/CozyVTT.git
cd CozyVTT
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in all required values. At minimum:

```env
# Database
DATABASE_PASSWORD=choose-a-strong-password-here

# Security — generate with: openssl rand -hex 32
SESSION_SECRET=your-64-char-random-string

# Your public URL (used for CORS and email links)
CORS_ORIGIN=https://your-domain.com

NODE_ENV=production
```

### 3. Build and start the stack

```bash
docker compose up -d --build
```

This starts four containers on an isolated internal network:
- `cozyvtt-database` — PostgreSQL 15 (internal only, not exposed to host)
- `cozyvtt-backend` — Express API on internal port 4000
- `cozyvtt-frontend` — React SPA served by Nginx on internal port 80
- `cozyvtt-nginx` — Reverse proxy, the only container with public ports (80 and 443)

Database migrations run automatically when the backend starts.

### 4. Complete the setup wizard

Navigate to `http://your-server` (or `http://localhost` if testing locally) and complete the setup wizard to create your admin account.

### 5. Verify the stack

```bash
# Check all containers are healthy
docker compose ps

# Confirm migrations ran
docker compose logs backend | grep -i migrat

# Health check (returns {"status":"healthy",...})
curl http://localhost/health
```

### Stopping and Starting

```bash
docker compose stop          # Stop without removing containers
docker compose start         # Start stopped containers
docker compose restart       # Restart all services
docker compose down          # Stop and remove containers (data volume preserved)
docker compose down -v       # ⚠️ Also removes volumes — deletes all database data
```

---

## Port Configuration

By default, the Nginx container binds to host ports **80** (HTTP) and **443** (HTTPS). If those ports are already in use, set `HTTP_PORT` and/or `HTTPS_PORT` in your `.env`:

```env
# Access CozyVTT at http://yourserver:8080
HTTP_PORT=8080
HTTPS_PORT=8443
```

The defaults (`80`/`443`) apply if these variables are not set.

---

## Using an External Reverse Proxy

If you already run a reverse proxy (Traefik, Caddy, another Nginx, or a Cloudflare Tunnel), you don't need the bundled `nginx` service.

**Option A — Remove the nginx service and expose the frontend directly:**

1. Delete the `nginx` service block from `docker-compose.yml`
2. Change the `frontend` service from `expose` to `ports`:
   ```yaml
   ports:
     - "8080:80"   # or whichever port your proxy can reach
   ```
3. Point your proxy to:
   - `/api/*` and `/socket.io/*` → `backend:4000` (or `localhost:4000` from the host)
   - Everything else → `frontend:80` (or `localhost:8080`)

**Option B — Shared Docker network (recommended for Traefik/Caddy):**

1. Remove the `nginx` service from `docker-compose.yml`
2. Add your proxy's network to both `frontend` and `backend` services:
   ```yaml
   networks:
     - internal
     - proxy     # your external proxy's network name
   ```
3. Declare it as external at the bottom:
   ```yaml
   networks:
     internal:
       driver: bridge
     proxy:
       external: true
   ```
4. Configure your proxy to route to `frontend:80` and `backend:4000` by container name.

**Cloudflare Tunnel:**

Use Option A or B above. Cloudflare Tunnel does not require ports 80 or 443 to be open on your host — `cloudflared` makes outbound connections to Cloudflare's network, so no inbound firewall rules are needed.

### Minimum proxy requirements

Whatever proxy you use, it must:
- Forward `/api/*` and `/socket.io/*` to the backend
- Support WebSocket upgrades (`Upgrade: websocket` / `Connection: upgrade`) on the `/socket.io/` path
- Pass `X-Forwarded-For` and `X-Forwarded-Proto` headers to the backend
- Allow request bodies of at least **55 MB** (covers the default `MAX_MAP_SIZE_MB=50` plus overhead), and more if you raise any `MAX_*_SIZE_MB` — see [Upload Size Limits](#upload-size-limits)

> ⚠️ **Cloudflare users:** Cloudflare-proxied requests — including Cloudflare Tunnel — are capped at **100 MB** per request body on Free and Pro plans. Uploads above that are rejected at Cloudflare's edge no matter how CozyVTT or your proxy is configured.

---

## SSL/TLS with Let's Encrypt

> ℹ️ **Not validated by the maintainer.** The maintainer's reference deployment uses [Cloudflare Tunnel](#cloudflare-tunnel-recommended-for-public-instances) (easier, better security, free, hides your origin IP), so this Let's Encrypt path has not been part of the maintainer's own deployment testing. The instructions below are accurate to the bundled Nginx config and should work, but community confirmation and contributions are very welcome — if you successfully deploy CozyVTT with Let's Encrypt, please open an issue or PR with any tweaks you needed.
>
> Use this path if you have a reason to avoid Cloudflare (data residency, paranoia about edge TLS termination, regional access issues, or just personal preference) — those are all legitimate.

### Prerequisites

- A domain name pointing at your server
- Ports 80 and 443 open in your firewall (the default configuration)

### Obtain a certificate

```bash
# Install Certbot
sudo apt-get install -y certbot

# Stop the nginx container temporarily so Certbot can bind port 80
docker compose stop nginx
sudo certbot certonly --standalone -d your-domain.com
docker compose start nginx
```

Certificates are placed at `/etc/letsencrypt/live/your-domain.com/`.

### Configure Nginx to use the certificate

1. Copy the certs into `nginx/certs/`:
   ```bash
   sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem nginx/certs/server.crt
   sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem nginx/certs/server.key
   sudo chown $(whoami) nginx/certs/*
   ```

2. In `nginx/nginx.conf`, uncomment the HTTPS server block and the HTTP-to-HTTPS redirect.

3. Restart Nginx:
   ```bash
   docker compose restart nginx
   ```

### Automate certificate renewal

Certbot installs a systemd timer. Test it:

```bash
sudo certbot renew --dry-run
```

After each renewal, re-copy the updated certs and restart Nginx. Add to cron:

```bash
# Weekly, Monday at 3 AM
0 3 * * 1 \
  cp /etc/letsencrypt/live/your-domain.com/fullchain.pem /path/to/cozyvtt/nginx/certs/server.crt && \
  cp /etc/letsencrypt/live/your-domain.com/privkey.pem /path/to/cozyvtt/nginx/certs/server.key && \
  docker compose -f /path/to/cozyvtt/docker-compose.yml restart nginx
```

---

## Manual Deployment

If you prefer to manage the processes yourself (systemd, pm2, etc.) without Docker:

### 1. Install Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 2. Install PostgreSQL 15

```bash
sudo apt-get install -y postgresql-15
sudo -u postgres createdb cozyvtt
sudo -u postgres createuser cozyvtt
sudo -u postgres psql -c "ALTER USER cozyvtt WITH PASSWORD 'your-db-password';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE cozyvtt TO cozyvtt;"
```

### 3. Configure and build

```bash
# Backend
cd backend
cp .env.example .env
# Edit .env — set DATABASE_URL, SESSION_SECRET, NODE_ENV=production
npm install
npx prisma migrate deploy
npm run build

# Frontend (empty VITE_API_URL = relative URLs, routed by your Nginx)
cd ../frontend
npm install
VITE_API_URL="" VITE_SOCKET_URL="" npm run build
# Output: frontend/dist/
```

### 4. Run the backend with pm2

```bash
npm install -g pm2
cd backend
pm2 start dist/server.js --name cozyvtt-backend
pm2 save
pm2 startup  # Follow the printed instructions to enable autostart
```

### 5. Serve with Nginx

Create `/etc/nginx/sites-available/cozyvtt`:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate     /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;

    # Must be >= the largest MAX_*_SIZE_MB in .env, plus a few MB of overhead
    client_max_body_size 55M;

    # API → backend
    location /api/ {
        proxy_pass         http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }

    # WebSocket → backend
    location /socket.io/ {
        proxy_pass         http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade           $http_upgrade;
        proxy_set_header   Connection        "upgrade";
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_read_timeout 86400s;
    }

    # Frontend static files (SPA)
    location / {
        root  /path/to/cozyvtt/frontend/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/cozyvtt /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## Environment Configuration

### Generating Secrets

```bash
# Generates a SESSION_SECRET. Run once and paste into .env.
openssl rand -hex 32
```

### SMTP Setup (Optional)

Email is required for password reset and invitation notifications. Configure in `.env`:

```env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=noreply@your-domain.com
SMTP_PASS=your-smtp-password
SMTP_FROM="CozyVTT <noreply@your-domain.com>"
SMTP_SECURE=false   # true for port 465 (TLS), false for port 587 (STARTTLS)
APP_URL=https://your-domain.com
```

Test from **Admin Dashboard → Settings → Test Email** after deploying.

If SMTP is not configured, admin-initiated password resets still work — the admin generates a temporary password from the Users tab.

### Upload Size Limits

```env
MAX_MAP_SIZE_MB=50
MAX_TOKEN_SIZE_MB=5
MAX_AUDIO_SIZE_MB=20
MAX_AVATAR_SIZE_MB=2

# Request body cap for the bundled Nginx — must be >= the largest limit above
# plus ~5 MB of multipart overhead
NGINX_MAX_BODY_SIZE=55M
```

These take effect on `docker compose up -d` (no image rebuild needed): the backend enforces them, and the app fetches them at runtime for the admin panel and the upload dialog. Values that aren't a positive number are ignored, with a warning in the backend log.

**If you raise a limit, raise the proxy limit too.** A file larger than the proxy's body cap is rejected with an HTTP 413 before it ever reaches CozyVTT:

| Setup | What to change |
|---|---|
| Bundled Nginx (default `docker-compose.yml`) | Set `NGINX_MAX_BODY_SIZE` in `.env`, then `docker compose up -d` |
| Your own Nginx | `client_max_body_size` in your server block |
| Traefik | `buffering.maxRequestBodyBytes` middleware (defaults to unlimited) |
| Caddy | `request_body { max_size ... }` |
| Cloudflare proxy / Tunnel | Hard 100 MB cap on Free/Pro — not configurable |

The backend logs its effective limits at startup and warns when they exceed the configured proxy cap:

```
Upload limits: MAP 50MB, TOKEN 5MB, AUDIO 250MB, AVATAR 2MB
NGINX_MAX_BODY_SIZE=55M is smaller than the largest upload limit AUDIO (250 MB). ...
```

The admin panel shows the same numbers under **Settings → Upload Size Limits**, along with the body size your proxy needs.

---

## File Storage

Uploaded files are stored at `backend/uploads/`. In the Docker setup this directory is bind-mounted from the host, so files survive container restarts and image rebuilds.

Back up `backend/uploads/` alongside your database dumps. See [Database Backups](#database-backups) below.

For large or multi-server deployments, consider mounting an S3-compatible object store (MinIO, AWS S3) as a FUSE filesystem at `backend/uploads/`. No code changes required.

---

## Database Backups

### Via Admin Dashboard

**Admin Dashboard → Backups → Create Backup** generates a compressed `pg_dump` file you can download for offsite storage.

### Via Command Line

```bash
# Create a backup
docker compose exec database \
  pg_dump -U cozyvtt cozyvtt | gzip > backup_$(date +%Y%m%d_%H%M%S).sql.gz

# Restore from a backup
gunzip -c backup_YYYYMMDD_HHMMSS.sql.gz | \
  docker compose exec -T database psql -U cozyvtt cozyvtt
```

### Automated Daily Backups (cron)

```bash
crontab -e

# Daily at 3 AM, keep 30 days of history
0 3 * * * cd /path/to/cozyvtt && \
  docker compose exec -T database pg_dump -U cozyvtt cozyvtt \
  | gzip > /backups/cozyvtt_$(date +\%Y\%m\%d).sql.gz && \
  find /backups -name "cozyvtt_*.sql.gz" -mtime +30 -delete
```

---

## Monitoring and Logs

### Container Logs

```bash
# Follow all containers
docker compose logs -f

# Backend only
docker compose logs -f backend

# Filter for errors
docker compose logs backend | grep -i error
```

### Persistent Log Files

The backend writes structured JSON logs to `backend/logs/` on the host:

- `backend/logs/combined.log` — all log levels
- `backend/logs/error.log` — errors only

### Health Check Endpoint

```
GET /health
```

Returns `200 OK` when healthy:

```json
{
  "status": "healthy",
  "timestamp": "2026-01-01T00:00:00.000Z",
  "services": { "api": "ok", "database": "ok" }
}
```

Returns `503` with `"status": "degraded"` if the database is unreachable. Useful for uptime monitors and load balancer health probes.

```bash
curl http://your-server/health
```

### Database Connectivity

```bash
docker compose exec database pg_isready -U cozyvtt
```

---

## Updating CozyVTT

```bash
git pull origin main

# Rebuild images and restart
docker compose up -d --build

# Confirm migrations ran
docker compose logs backend | grep -i migrat
```

Database migrations run automatically via `prisma migrate deploy` on every startup. Downtime is typically under 30 seconds while containers restart.

### Without Docker

```bash
git pull origin main

cd backend
npm install
npx prisma migrate deploy
npm run build
pm2 restart cozyvtt-backend

cd ../frontend
npm install
VITE_API_URL="" VITE_SOCKET_URL="" npm run build
# Static files in frontend/dist/ are now updated — Nginx serves them immediately
```

---

## Hardening Checklist

Before going live:

- [ ] **Strong secret** — `SESSION_SECRET` is a 32+ character random string, not the placeholder value from `.env.example`
- [ ] **HTTPS only** — SSL certificate installed; HTTP block in `nginx/nginx.conf` redirects to HTTPS
- [ ] **Firewall** — Only ports 80 and 443 (or your configured `HTTP_PORT`/`HTTPS_PORT`) are publicly reachable; backend (4000) and database (5432) are not exposed to the internet
- [ ] **CORS_ORIGIN** — Set to your specific domain, not a wildcard
- [ ] **Registration** — `allowRegistration` is **off** for private instances (configure in **Admin → Settings** after setup)
- [ ] **Admin MFA** — Admin account has MFA enabled
- [ ] **Backups tested** — Automated backups configured and a restore drill completed successfully
- [ ] **Upload isolation** — `backend/uploads/` is served only through authenticated backend endpoints, not directly by the web server
- [ ] **Security headers** — HSTS, X-Content-Type-Options, X-Frame-Options are set in the Nginx HTTPS block
- [ ] **Database isolation** — PostgreSQL container uses `expose` (not `ports`); unreachable from outside the Docker network
- [ ] **Log rotation** — `backend/logs/` directory is being rotated (consider `logrotate` for the host-mounted path)
- [ ] **OS updates** — A plan exists for keeping the host OS and Docker up to date
- [ ] **Brute-force protection** — `fail2ban` (or equivalent) is configured to block IPs hammering `/api/auth/login` and SSH; CozyVTT's own auth limiter is 5 req/15min on auth routes, but a host-level ban catches scanners earlier
- [ ] **Stable update plan** — You watch the [CozyVTT repo](https://github.com/CheekyChinchilla/CozyVTT) for releases and apply security patches promptly (no auto-update is bundled — that's your choice)
- [ ] **Vulnerability reporting path** — You've read [SECURITY.md](../SECURITY.md) and know how to report issues responsibly
- [ ] **Origin hidden (optional but recommended)** — Instance is fronted by a Cloudflare Tunnel, Tailscale Funnel, or equivalent so the server's real IP is never exposed (see below)

---

## Cloudflare Tunnel (Recommended for Public Instances)

If CozyVTT is reachable from the internet, fronting it with a **[Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)** is the cheapest, lowest-effort way to harden the deployment. Tunnels are free for personal use and provide:

- **No open ports** — your VPS doesn't need 80/443 (or anything) reachable from the internet; the tunnel daemon makes an outbound connection to Cloudflare and accepts incoming traffic through that
- **Origin IP hidden** — attackers can't directly reach your server even if they know your domain
- **Automatic DDoS / bot protection** at the edge
- **Free TLS** without managing Let's Encrypt yourself
- **Optional Zero Trust gating** — require Google / GitHub / one-time-PIN auth before users can even reach the login page (great for private campaigns)

### Quick setup

1. Sign up at [Cloudflare](https://www.cloudflare.com/) and point your domain's nameservers at them.
2. Install `cloudflared` on the VPS:
   ```bash
   curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cloudflared.deb
   sudo dpkg -i cloudflared.deb
   ```
3. Authenticate the daemon to your Cloudflare account:
   ```bash
   cloudflared tunnel login
   ```
4. Create a tunnel and point it at your local CozyVTT:
   ```bash
   cloudflared tunnel create cozyvtt
   cloudflared tunnel route dns cozyvtt cozyvtt.example.com
   ```
5. Create `~/.cloudflared/config.yml`:
   ```yaml
   tunnel: <tunnel-id-from-step-4>
   credentials-file: /root/.cloudflared/<tunnel-id>.json

   ingress:
     - hostname: cozyvtt.example.com
       service: http://localhost:80   # or whatever HTTP_PORT you set
     - service: http_status:404
   ```
6. Run as a service:
   ```bash
   sudo cloudflared service install
   sudo systemctl start cloudflared
   ```

Once running, you can **close ports 80 and 443 on your VPS firewall entirely** — only SSH (port 22, or your chosen alternative) needs to be reachable, and even that you can put behind Cloudflare Access if you want.

### When NOT to use a Cloudflare Tunnel

- You don't trust Cloudflare with TLS termination (they technically see decrypted traffic)
- You have strict data-residency requirements that conflict with Cloudflare's global edge
- You're running on LAN-only — no tunnel needed; just use the local IP or a Tailscale node

Alternatives in the same family: **Tailscale Funnel** (P2P, no third-party termination), **ngrok**, **inlets**, or running your own reverse proxy + WAF (more work, more control).

---

## Hosting the API Documentation

CozyVTT ships an OpenAPI 3.0 spec at [`backend/docs/API_DOCUMENTATION.yaml`](../backend/docs/API_DOCUMENTATION.yaml). It documents every endpoint with examples, error responses, and schemas. You have three reasonable options for what to do with it:

### Option A — Publish publicly (recommended for community instances)

Host the rendered Swagger UI / Redoc at a public URL like `/docs`. This is what every major API provider does (Stripe, GitHub, etc.) and is **not a security risk** — every endpoint requires authentication or proper RBAC, and obscuring routes is not a meaningful defense against automated scanners.

To render the docs to a static HTML page:

```bash
cd backend
npx @redocly/cli build-docs docs/API_DOCUMENTATION.yaml --output public/docs.html
```

Then serve `public/docs.html` from your Nginx config:

```nginx
location = /docs {
    alias /path/to/backend/public/docs.html;
    default_type text/html;
}
```

### Option B — Behind authentication

If you'd rather not advertise your instance's endpoints, serve the docs only to logged-in admins:

```nginx
location = /docs {
    auth_request /api/auth/me;
    alias /path/to/backend/public/docs.html;
}
```

This calls `/api/auth/me` on every docs request; non-authenticated users get a 401 redirect to login.

### Option C — Don't host them on the instance at all

Keep the spec in the repo and reference it from a separate docs site (e.g. `cozyvtt.com/docs`). Self-hosters who never need API access get a slightly smaller attack surface and a cleaner Nginx config.

### A note on enumeration

Whichever option you pick, do **not** rely on hiding the spec as a security measure. Real protection comes from:

- Per-endpoint authentication and RBAC checks (built in — see `backend/src/middleware/`)
- Rate limiting (auth 5/15min, uploads 30/min, general API 300/min)
- Magic-byte file validation (not MIME header)
- Strong session secrets and Argon2id password hashing
- Helmet.js CSP headers in production

If those are in place, documenting the API is a feature, not a risk.
