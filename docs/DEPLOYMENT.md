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
11. [Troubleshooting](#troubleshooting)
12. [Updating CozyVTT](#updating-cozyvtt)
13. [Hardening Checklist](#hardening-checklist)

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

Edit `.env` and fill in all required values. At minimum (with `NODE_ENV=production`, the app refuses to start while either `DATABASE_PASSWORD` or `SESSION_SECRET` is still the placeholder from `.env.example`):

```env
# Database
DATABASE_PASSWORD=choose-a-strong-password-here

# Security — generate with: openssl rand -hex 32
SESSION_SECRET=your-64-char-random-string

# Your public URL (used for CORS and email links)
CORS_ORIGIN=https://your-domain.com

NODE_ENV=production
```

`CORS_ORIGIN` is also the only other address a browser page may make changes from. A page on any other address, another port on the same server included, is refused if it tries to sign in, save or delete anything as whoever is signed in. With the bundled nginx the app and its API share one address, so this needs nothing from you; if you serve the frontend from a separate address, `CORS_ORIGIN` must be exactly that address (`https://`, host and any port).

### Changing the database password

The database image reads `POSTGRES_PASSWORD` only when it creates an empty database, so on an instance that has already run, changing `DATABASE_PASSWORD` in `.env` on its own locks the backend out: the database keeps the old password and the backend connects with the new one. This is what happens if you upgrade with the placeholder still in place and the backend stops with `DATABASE_URL uses the placeholder password from .env.example` in `docker compose logs backend`.

Change it inside the database first, with the stack up (the database container runs even while the backend refuses to start):

```bash
NEW_PASSWORD=$(openssl rand -hex 24)
docker compose exec database psql -U cozyvtt -d cozyvtt -c "ALTER USER cozyvtt WITH PASSWORD '$NEW_PASSWORD';"
echo "$NEW_PASSWORD"
```

The command uses the default names. If you changed them in `.env`, put your `DATABASE_USER` in place of `cozyvtt` after `-U` and after `ALTER USER`, and your `DATABASE_NAME` in place of `cozyvtt` after `-d`. Then put the printed value in `.env` as `DATABASE_PASSWORD` (and in `DATABASE_URL` too if you wrote that by hand), and restart:

```bash
docker compose up -d
```

A hex password avoids any quoting trouble in the command above and in `.env`. On a manual install the same `ALTER USER` runs through `sudo -u postgres psql`, as in the install steps below.

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
docker compose exec backend wget -qO- http://localhost:4000/health

# The API answers on the same address as the site — this must be JSON, not a web page
curl -s -w '\n%{http_code} %{content_type}\n' http://localhost/api/setup/status
```

That last check should print something like
`{"setupCompleted":false,"hasUsers":false,"needsSetup":true}` and, on the line below it,
`200 application/json; charset=utf-8`. If it prints a web page and its last line ends in `text/html`,
your `/api` requests are landing on the web pages instead of the API — see
[Using an External Reverse Proxy](#using-an-external-reverse-proxy).

### Stopping and Starting

```bash
docker compose stop          # Stop without removing containers
docker compose start         # Start stopped containers
docker compose restart       # Restart all services (keeps the old settings: after editing .env, use `docker compose up -d`)
docker compose down          # Stop and remove containers (data volume preserved)
docker compose down -v       # ⚠️ Also removes volumes — deletes all database data
```

Stopping the backend takes about a second. It finishes the requests it is answering, disconnects everyone at the table (their browsers reconnect by themselves once it is back), closes its database connections, and exits. Anything still running after 8 seconds, such as a large download, is cut off and the backend exits anyway, inside the 10 seconds Docker allows before it forces a container to stop. A backend run without Docker stops the same way on Ctrl+C or when a service manager such as systemd or pm2 stops it.

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

### First, the one thing that trips everyone up

CozyVTT runs as three pieces: a **frontend** (the web pages you see), a **backend** (the API and live game connection), and a **database**. Your browser talks to both the frontend and the backend, on the same web address:

| Web address | Must reach |
|---|---|
| `/api/...` | the **backend** |
| `/socket.io/...` | the **backend** (this is the live connection — dice rolls, token movement, chat) |
| everything else | the **frontend** |

The bundled `nginx` service is what normally does that splitting. **If you remove it, your own proxy has to do all three lines above.**

There's a second catch. Out of the box, the backend and frontend use `expose`, which means *"other containers can reach me"* — **not** *"the outside world can reach me."* The bundled nginx is the only piece with `ports`, which is what actually opens a port on your server. So when you delete the nginx service, you also have to open ports on the backend and frontend yourself, or your proxy will be pointing at nothing.

> **If you miss this:** the site loads and looks fine, but the setup wizard never appears (you get a login page you can't use), or setup fails with **502**. That's the API being unreachable — the pages come from the frontend, which is still working.

### Option A — Remove the nginx service (most common)

1. **Delete the `nginx` service block** from `docker-compose.yml` (the whole `nginx:` section).

2. **Open ports on the backend and frontend.** In `docker-compose.yml`, replace the `expose` block in each service with `ports`:

   ```yaml
     backend:
       # ...
       ports:
         - "127.0.0.1:4000:4000"     # was: expose: - "4000"

     frontend:
       # ...
       ports:
         - "127.0.0.1:8080:80"       # was: expose: - "80"
   ```

   Read `"127.0.0.1:8080:80"` as: *port 80 inside the container becomes port 8080 on this server, reachable only from this server itself.*

   > 🔒 **Keep the `127.0.0.1:` prefix.** Without it (`"4000:4000"`), your API is published on your server's public IP over plain, unencrypted HTTP — anyone who finds it bypasses your proxy entirely, along with any protection it provides. The `CORS_ORIGIN` setting does **not** protect against this; it only restricts browsers, not tools like `curl`.
   >
   > A firewall is not a substitute here: **Docker's published ports bypass UFW**, so a rule like `ufw deny 4000` usually does *not* block a port published this way. The `127.0.0.1:` prefix is the reliable control.

3. **Point your proxy at those ports:**

   | Requests for | Send to |
   |---|---|
   | `/api/...` | `http://localhost:4000` |
   | `/socket.io/...` | `http://localhost:4000` |
   | everything else | `http://localhost:8080` |

4. **Restart and check it worked:**

   ```bash
   docker compose down     # also stops the old nginx container
   docker compose up -d
   curl -s -w '\n%{http_code} %{content_type}\n' https://your-domain.com/api/setup/status
   ```

   Use `down` first: deleting the `nginx` block from the file does **not** stop a container that is already running, and a leftover nginx still holding port 80 will confuse things. Your database is stored in a volume and is not affected by `down` (only `down -v` would erase it).

   You should see a line like `{"setupCompleted":false,...}` and, below it, `200 application/json; charset=utf-8`. If you see a web page whose last line ends in `text/html`, your proxy is sending `/api` to the frontend instead of the backend. If the last line starts with `502`, nothing is listening where your proxy is pointing — usually step 2 was skipped.

5. **Check the security headers still arrive:**

   ```bash
   curl -sI https://your-domain.com/ | grep -i -E 'content-security|x-frame'
   ```

   CozyVTT sets these on the frontend container, so removing the bundled Nginx does not lose them — a proxy passes response headers through by default. If nothing comes back, your proxy is stripping or replacing them; whatever it offers instead needs to allow `https://fonts.googleapis.com` for stylesheets and `https://fonts.gstatic.com` for fonts, or every theme loses its typeface. See `frontend/security-headers.conf` for the policy CozyVTT sends.

### Option B — Shared Docker network (recommended for Traefik/Caddy)

If your proxy also runs in Docker, this is cleaner: it talks to the containers directly by name, and **no ports need to be opened at all**.

1. Remove the `nginx` service block from `docker-compose.yml`
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
4. Configure your proxy to route to `frontend:80` and `backend:4000` by container name — same three routing lines from the table above.

### Cloudflare Tunnel

`cloudflared` makes an outbound connection to Cloudflare, so no inbound ports need to be open on your server's firewall. There are three ways to set it up — pick one:

**1. Keep the bundled nginx (simplest, recommended).** Leave `docker-compose.yml` exactly as shipped and point the tunnel at it. One rule, nothing to open, and nginx handles the `/api` vs `/socket.io` vs frontend split for you:

```yaml
# ~/.cloudflared/config.yml
ingress:
  - hostname: cozyvtt.example.com
    service: http://localhost:80        # or your HTTP_PORT
  - service: http_status:404
```

This is also the option that keeps upload limits (`NGINX_MAX_BODY_SIZE`), secure-cookie headers and each visitor's own address (see [Visitor addresses and sign-in limits](#visitor-addresses-and-sign-in-limits)) working without extra configuration.

**2. Run `cloudflared` as a container** on CozyVTT's own Docker network. Nothing is published to the host at all — the tunnel reaches the containers by name:

```yaml
ingress:
  - hostname: cozyvtt.example.com
    path: ^/api/
    service: http://backend:4000
  - hostname: cozyvtt.example.com
    path: ^/socket.io/
    service: http://backend:4000
  - hostname: cozyvtt.example.com
    service: http://frontend:80
  - service: http_status:404
```

> ⚠️ Inside a container, `localhost` means *that container itself*, not your server. Use the service names (`backend`, `frontend`) as above — `http://localhost:4000` will fail here.

**3. `cloudflared` installed on the server** (not in Docker), with the ports from Option A step 2 opened:

```yaml
ingress:
  - hostname: cozyvtt.example.com
    path: ^/api/
    service: http://localhost:4000
  - hostname: cozyvtt.example.com
    path: ^/socket.io/
    service: http://localhost:4000
  - hostname: cozyvtt.example.com        # catch-all — must be LAST
    service: http://localhost:8080
  - service: http_status:404
```

**Rule order matters.** Cloudflare reads ingress rules top to bottom and uses the **first** one that matches. A rule with only a `hostname` matches *everything* for that domain, so if you put it above the `path` rules, it swallows `/api` and `/socket.io` — and you get the "login page instead of setup wizard" symptom. Always list the specific `path` rules first and the catch-all last.

`path: ^/api/` is a pattern meaning *"any address starting with `/api/`"*. Keep it exactly as written.

After editing `~/.cloudflared/config.yml`, restart the tunnel and re-run the check from Option A step 4:

```bash
sudo systemctl restart cloudflared
curl -s -w '\n%{http_code} %{content_type}\n' https://cozyvtt.example.com/api/setup/status
```

### Visitor addresses and sign-in limits

CozyVTT limits how often one visitor may get a password wrong: five failed sign-ins in fifteen minutes, then that visitor waits. Only a wrong password (or a wrong code when turning two-factor sign-in off, or a password reset link that no longer works) counts. Typing the right password never does, even when everyone in a household signs in at the same moment.

The two-factor code (the six-digit code from an authenticator app, or a backup code, asked for after the password on accounts that use two-factor sign-in) has a separate limit: five wrong codes in fifteen minutes from one visitor, and five for one account from anywhere. A right code does not count against it, but this limit has no allowance for people signing in together: if more than five people behind one address enter their codes at the very same moment, the ones past five are refused and have to enter their code again.

Both limits tell visitors apart by their *IP address*, the address their device connects from, so CozyVTT has to see each visitor's own address and not your tunnel's or proxy's.

**With the bundled nginx this is handled for you**, including behind a Cloudflare Tunnel. A tunnel or proxy names the visitor it is passing along in a header called `X-Forwarded-For`. nginx believes that header only when the connection comes from a *private address*: `127.0.0.1`, or one starting with `10.`, `172.16.` to `172.31.`, or `192.168.`. That is what a tunnel on the same server, a proxy in Docker, or a proxy on your own network looks like. Someone connecting straight from the internet cannot pretend to be someone else by sending the header; nginx uses the address they actually connect from.

To check it, open CozyVTT from a device outside your network (a phone on mobile data, with Wi-Fi off), then run this on the server:

```bash
docker compose logs --tail 5 nginx
```

After the `cozyvtt-nginx |` label, each line starts with the address CozyVTT saw, for example:

```
cozyvtt-nginx  | 203.0.113.25 - - [28/Sep/2026:14:09:46 +0000] "GET /api/auth/me HTTP/1.1" 200 ...
```

You want the phone's public address there. **If it starts with `172.`, `10.` or `192.168.`**, every visitor is being counted as that one address, and a few wrong passwords from anyone lock everybody out of signing in for fifteen minutes. That happens when:

- **A proxy in front of nginx is on a public address**, for example Cloudflare's proxy (the orange cloud) pointed at your server's public IP without a tunnel. nginx does not believe a public address, so add that proxy's address ranges to `nginx/nginx.conf`, one `set_real_ip_from` line each, next to the lines already there. For Cloudflare the ranges are listed at [cloudflare.com/ips](https://www.cloudflare.com/ips/). Then run `docker compose restart nginx`. `git pull` will stop at the changed file from then on; set your change aside and bring it back with the same `git stash` steps as in [Updating after you've edited `docker-compose.yml`](#updating-after-youve-edited-docker-composeyml).
- **Docker hands visitors to nginx from its own address.** Docker Desktop (on Windows and Mac) and rootless Docker do this. A visitor connecting straight to such a server could then choose the address CozyVTT counts them as. Put a [Cloudflare Tunnel](#cloudflare-tunnel-recommended-for-public-instances) or your own proxy in front, and keep ports 80 and 443 closed to the internet.

One thing to know: a device on your own network connects from a private address, so it can set the header itself and choose the address CozyVTT counts it as. On a home network those are people you already let in.

**If you removed the bundled nginx**, the backend takes the **last** address in the `X-Forwarded-For` header your proxy sends as the visitor's own. Proxies add the address they were connected from there, which is right when nothing else stands in front of yours. If something does (Cloudflare's proxy in front of Caddy, say), set your proxy to believe it, or every visitor counts as the same address: `trusted_proxies` in Caddy, `forwardedHeaders.trustedIPs` in Traefik, `set_real_ip_from` in nginx.

### Minimum proxy requirements

Whatever proxy you use, it must:
- Forward `/api/*` and `/socket.io/*` to the backend, and everything else to the frontend
- Support WebSocket upgrades (`Upgrade: websocket` / `Connection: upgrade`) on the `/socket.io/` path
- Pass `X-Forwarded-Proto` to the backend, and `X-Forwarded-For` with the visitor's own address last (see [Visitor addresses and sign-in limits](#visitor-addresses-and-sign-in-limits))
- Allow request bodies of at least **55 MB** (covers the default `MAX_MAP_SIZE_MB=50` plus overhead), and more if you raise any `MAX_*_SIZE_MB` — see [Upload Size Limits](#upload-size-limits)
- For importing campaigns: allow `/api/campaigns/import` (which also covers `/api/campaigns/import/preview`) a request body of at least **505 MB**, the 500 MB largest archive plus overhead, and give it about **300 seconds** to answer, since a large archive takes minutes to unpack. The bundled nginx allows 512 MB there whatever `NGINX_MAX_BODY_SIZE` says. Without this, importing an archive bigger than your body limit shows "This archive is larger than the server accepts", and a slow import shows an error while the backend carries on and finishes it. Where your proxy can, pass the upload straight through instead of saving it first (`proxy_request_buffering off` in nginx)
- For the Admin Dashboard's backups: allow `/api/admin/backups/restore` a request body as large as your biggest backup (the bundled nginx allows 4 GB), and give both `/api/admin/backups` and `/api/admin/backups/restore` about **600 seconds** to answer (most proxies wait 60). Making or restoring a backup, uploaded files and all, happens inside that one request. Without this, restoring a backup bigger than your body limit fails with **413**, and making a backup that takes longer than your proxy waits shows **504**; the backend carries on, and the backup appears in the list when it is done. Where your proxy can, have it pass the restore upload straight through instead of saving it first (`proxy_request_buffering off` in nginx), so a stranger cannot fill its disk
- Let a large campaign import or backup restore take its time to arrive on a slow connection. CozyVTT itself waits up to an hour for an upload, so it is your proxy's limits that count: give these paths a body timeout that drops a client that **stops** sending, not one that ends a slow but steady upload. nginx's `client_body_timeout` works that way (60 seconds between two pieces of the upload, by default), and the bundled nginx relies on it

> ⚠️ **A proxy that only serves the web pages looks like it works.** If `/api` isn't routed to the backend, those requests come back as the CozyVTT web page itself with a success code, so the site loads normally while every API call quietly fails. Symptoms: a brand-new install shows the login page instead of the setup wizard, and `/setup` bounces straight back to the home page. The `curl` check above tells you in one command.

> ⚠️ **Cloudflare users:** Cloudflare-proxied requests — including Cloudflare Tunnel — are capped at **100 MB** per request body on Free and Pro plans. Uploads above that are rejected at Cloudflare's edge no matter how CozyVTT or your proxy is configured. Cloudflare also gives up on a request that has had no answer for **100 seconds**. Both limits apply to the dashboard's backups: restoring a backup over 100 MB fails at Cloudflare, and making or restoring one that takes longer than 100 seconds shows an error even though the backend carries on. They apply to campaign imports too: an archive over 100 MB cannot be imported through Cloudflare, and a large import may show an error although it finishes. Exports are not affected, because the server starts sending an export straight away. To restore a large backup, copy it to the server and use the restore script steps under [Via Admin Dashboard](#via-admin-dashboard).

### Updating after you've edited `docker-compose.yml`

Once you've changed `docker-compose.yml`, a plain `git pull` will stop and complain, because your changes and ours are both in that file:

```
error: Your local changes to the following files would be overwritten by merge:
        docker-compose.yml
Please commit your changes or stash them before you merge.
```

The same happens, and the same steps below fix it, if you edited `nginx/nginx.conf` (to turn on HTTPS, for example, or to add a proxy's addresses); the message then names that file instead.

Set your changes aside, update, then put them back:

```bash
git stash          # tuck your edits away
git pull           # get the update
git stash pop      # re-apply your edits
```

If `git stash pop` reports a conflict, the file will contain both versions marked with `<<<<<<<`, `=======` and `>>>>>>>` lines. Open it, keep the lines you want, and delete the markers. Then tell Git you are done, and throw away the copy it kept of your edits (they are in the file now):

```bash
git reset          # mark the conflict as settled; your edits stay in the file
git stash drop     # the stash is kept after a conflict; this removes it
```

Then `docker compose up -d --build`. Skip these two commands and the next `git pull` or `git stash` refuses to run.

> ⚠️ **Don't "fix" this with `git checkout -- docker-compose.yml`.** That throws your customizations away and restores the shipped file — you'd lose your ports, your proxy setup, everything you changed.

### Optional: avoid the conflicts entirely (advanced)

If you update often and would rather never deal with the above, Docker Compose can read a **second, personal file** that sits on top of the shipped one. Name it `docker-compose.override.yml` and put it next to `docker-compose.yml`; `docker compose up -d` picks it up automatically, and CozyVTT's `.gitignore` already excludes it, so `git pull` will never touch it.

Copy the ready-made example to get started:

```bash
cp docker-compose.override.example.yml docker-compose.override.yml
```

It contains only the settings you're changing — **not** a copy of the whole file:

```yaml
services:
  nginx:
    profiles: ["disabled"]              # keeps nginx from starting
  backend:
    ports:
      - "127.0.0.1:4000:4000"
  frontend:
    ports:
      - "127.0.0.1:8080:80"
```

Two things to know:

- **Adding settings works naturally.** The `ports` lines above are simply added to the shipped configuration. You leave `docker-compose.yml` untouched, so it updates cleanly forever.
- **Removing a service doesn't.** There's no way to delete something in this second file — it can only add or change. The `profiles: ["disabled"]` line above is the workaround: it tags the nginx service so it never starts. (If you'd rather not use that, you can leave the line out and start CozyVTT with `docker compose up -d database backend frontend`, naming the services you want — but you have to remember it every time.)

Check that it did what you expect, then restart:

```bash
docker compose config --services   # lists what will run — nginx should be absent
docker compose config              # shows the full merged configuration

docker compose down                # stops the currently-running nginx
docker compose up -d
```

`down` is needed the first time because an nginx container that is already running keeps running until it is stopped — the profile only controls what *starts*.

> One catch: this automatic pickup only happens when you run plain `docker compose` commands. If you pass `-f` yourself, list both files: `docker compose -f docker-compose.yml -f docker-compose.override.yml up -d`.

### Can I run CozyVTT in a folder, like `example.com/cozyvtt/`?

Not at the moment. Give CozyVTT its own web address instead — `cozyvtt.example.com`, or `example.com` itself.

**Why:** the addresses of your maps and token pictures are saved starting with a `/`, which means "the top of this website". Put CozyVTT in a folder and those addresses point one level too high, so none of the pictures load. Changing the *domain* is free for the same reason — the domain was never part of the saved address — which is why moving from one hostname to another just works.

**What to do instead:** add a DNS record for `cozyvtt.example.com` pointing at your server, then match on that hostname rather than a path. In Traefik that means a `Host()` rule instead of `PathPrefix()`:

```yaml
# instead of:  PathPrefix(`/cozyvtt`)
- "traefik.http.routers.cozyvtt.rule=Host(`cozyvtt.example.com`)"
```

It takes about five minutes, and it is the setup CozyVTT is built and tested for.

Running in a folder is on the backlog rather than ruled out. If it matters to you, say so on the issue tracker — how many people need it is what decides whether it gets built.

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

Ubuntu's own package archive carries a single PostgreSQL version per release (14 on Ubuntu 22.04), so `postgresql-15` comes from the PostgreSQL project's package repository. Add it first:

```bash
sudo apt-get install -y curl ca-certificates
sudo install -d /usr/share/postgresql-common/pgdg
sudo curl -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc --fail https://www.postgresql.org/media/keys/ACCC4CF8.asc
. /etc/os-release
echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $VERSION_CODENAME-pgdg main" | sudo tee /etc/apt/sources.list.d/pgdg.list
sudo apt-get update
```

The `apt-get update` output should include lines starting `Get:` or `Hit:` for `https://apt.postgresql.org/pub/repos/apt`. Then install PostgreSQL and create the database:

```bash
sudo apt-get install -y postgresql-15
sudo -u postgres createuser cozyvtt
sudo -u postgres createdb -O cozyvtt cozyvtt
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

    # Backup restore → backend: a whole instance backup, up to 4 GB, passed
    # straight through (the backend refuses anyone but an admin before reading
    # it), with time to load it
    location /api/admin/backups/restore {
        proxy_pass              http://127.0.0.1:4000;
        proxy_http_version      1.1;
        proxy_set_header        Host              $host;
        proxy_set_header        X-Real-IP         $remote_addr;
        proxy_set_header        X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header        X-Forwarded-Proto $scheme;
        client_max_body_size    4096M;
        proxy_request_buffering off;
        proxy_read_timeout      600s;
        proxy_send_timeout      600s;
    }

    # Campaign import and its preview → backend: an archive is up to 500 MB,
    # passed straight through (the backend refuses anyone not signed in before
    # reading it), with time to unpack it
    location /api/campaigns/import {
        proxy_pass              http://127.0.0.1:4000;
        proxy_http_version      1.1;
        proxy_set_header        Host              $host;
        proxy_set_header        X-Real-IP         $remote_addr;
        proxy_set_header        X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header        X-Forwarded-Proto $scheme;
        client_max_body_size    512M;
        proxy_request_buffering off;
        proxy_read_timeout      300s;
        proxy_send_timeout      300s;
    }

    # Making a backup → backend: it answers only once the backup is written
    location /api/admin/backups {
        proxy_pass              http://127.0.0.1:4000;
        proxy_http_version      1.1;
        proxy_set_header        Host              $host;
        proxy_set_header        X-Real-IP         $remote_addr;
        proxy_set_header        X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header        X-Forwarded-Proto $scheme;
        proxy_read_timeout      600s;
        proxy_send_timeout      600s;
    }

    # Health check → backend, so an uptime monitor gets the backend's own
    # answer (503 when the database is unreachable) and not the web page
    location = /health {
        proxy_pass         http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_read_timeout 10s;
    }

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

Email is required for password resets and invitations. Configure in `.env`:

```env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=noreply@your-domain.com
SMTP_PASS=your-smtp-password
SMTP_FROM="CozyVTT <noreply@your-domain.com>"
SMTP_SECURE=false   # true for port 465 (TLS), false for port 587 (STARTTLS)
APP_URL=https://your-domain.com
```

Test it after deploying with **Send Test Email** on the **Settings** tab of the Admin Panel.

#### What SMTP unlocks

| Feature | With SMTP | Without SMTP |
|---|---|---|
| **Adding a user** | **Invite User** — they get an email with a link and choose their own password. Nobody else ever sees it. | **Create User** — a temporary password is generated and shown to you once, to hand over yourself |
| Password resets (self-service) | User clicks "Forgot password" and gets a reset link | Unavailable — the user has to ask an admin |
| Password resets (admin) | Email the user a reset link, or generate a temporary password | Generate a temporary password from the Users tab |
| Campaign invitations | Appear on the player's dashboard. The DM may *optionally* tick a box to email them as well | Appear on the player's dashboard; the email option is disabled and says why |

**Campaign invitations do not depend on SMTP.** A DM invites someone who already has an account, and the invitation shows up on that player's dashboard for them to accept — no link is involved and nothing needs to be shared by hand. As of 1.2.2 the accompanying email is opt-in per invitation and off by default, so a campaign runs perfectly well on an instance with no mail server. This is the opposite of the *account* invitations in the row above, which are an email or nothing.

Either way, an account created by an admin **must set its own password on first sign-in** — the
temporary password works for nothing else, so an admin never keeps usable access to someone's
account. Invitation links are valid for **7 days**; use **Invite** on the Users tab to send a fresh
one if it expires.

### Upload Size Limits

```env
MAX_MAP_SIZE_MB=50
MAX_TOKEN_SIZE_MB=5
MAX_AUDIO_SIZE_MB=20
MAX_AVATAR_SIZE_MB=2
MAX_DOCUMENT_SIZE_MB=50

# Request body cap for the bundled Nginx — must be >= the largest limit above
# plus ~5 MB of multipart overhead (a Universal VTT import needs more: see below)
NGINX_MAX_BODY_SIZE=55M
```

These take effect on `docker compose up -d` (no image rebuild needed): the backend enforces them, and the app fetches them at runtime for the admin panel and the upload dialog. Values that aren't a positive number are ignored, with a warning in the backend log.

`MAX_DOCUMENT_SIZE_MB` covers the PDF, text and Markdown files in the document library. Core rulebooks often run past 50 MB; if your group's do, raise this one and `NGINX_MAX_BODY_SIZE` together.

**Universal VTT imports need more room than the map limit.** A `.uvtt` file carries its picture as text, which is about a third (4/3) bigger than the picture itself. CozyVTT accepts a `.uvtt` file of up to the map limit times 4/3, plus 8 MB for the walls and lights (about 75 MB with the default `MAX_MAP_SIZE_MB=50`), and answers a larger one with a message saying so. With the default `NGINX_MAX_BODY_SIZE=55M`, the proxy refuses any `.uvtt` file over 55 MB with a 413, which means a picture larger than about 40 MB, although a plain map upload of up to 50 MB works. To let through every file CozyVTT accepts, multiply `MAX_MAP_SIZE_MB` by 4/3 and add 10: that covers the 8 MB for walls and lights and leaves a little over for the way the browser wraps the upload. With the default map limit, set `NGINX_MAX_BODY_SIZE=76M`.

**If you raise a limit, raise the proxy limit too.** A file larger than the proxy's body cap is rejected with an HTTP 413 before it ever reaches CozyVTT:

| Setup | What to change |
|---|---|
| Bundled Nginx (default `docker-compose.yml`) | Set `NGINX_MAX_BODY_SIZE` in `.env`, then `docker compose up -d` |
| Your own Nginx | `client_max_body_size` in your server block |
| Traefik | `buffering.maxRequestBodyBytes` middleware (defaults to unlimited) |
| Caddy | `request_body { max_size ... }` |
| Cloudflare proxy / Tunnel | Hard 100 MB cap on Free/Pro — not configurable |

**Campaign archives have a limit of their own.** Importing a campaign accepts an archive of up to 500 MB, and the bundled nginx gives the import its own body limit of 512 MB, so `NGINX_MAX_BODY_SIZE` does not have to be that large. If you use your own proxy, give `/api/campaigns/import` that limit as described under [Minimum proxy requirements](#minimum-proxy-requirements).

The backend logs its effective limits at startup and warns when they exceed the configured proxy cap:

```
Upload limits: MAP 50MB, TOKEN 5MB, AUDIO 250MB, AVATAR 2MB, DOCUMENT 50MB
NGINX_MAX_BODY_SIZE=55M is smaller than the largest upload limit AUDIO (250 MB). ...
```

The admin panel shows the same numbers under **Settings → Upload Size Limits**, along with the body size your proxy needs.

### Campaign Import and Export Limits

A campaign archive (the `.cozyvtt` file made by **Export Campaign** and read by **Import**) can be up to 500 MB, and the server reads all of it. So each user may, in any hour:

- preview 20 archives (the step where the import window shows what an archive holds),
- import 20 campaigns,
- export 20 campaigns,

and run only one of these at a time. Moving a campaign to another server takes one preview and one import, so a real table never comes near these numbers; they are there to stop a script. Someone who reaches one is told how many minutes to wait.

To change the number, set this in `.env` (it is the same number for all three):

```env
CAMPAIGN_ARCHIVE_RATE_LIMIT=20
```

Then apply it with `docker compose up -d`. Leave it out and the default of 20 applies. A value that is not a whole number above zero is ignored, with a warning in the backend log.

Uploading pictures, sound and documents, and importing Universal VTT maps, are not counted here. They have their own limit of 30 a minute per user, set with `ASSET_UPLOAD_RATE_LIMIT`.

---

## File Storage

Uploaded files are stored at `backend/uploads/`. In the Docker setup this directory is bind-mounted from the host, so files survive container restarts and image rebuilds.

Back up `backend/uploads/` alongside your database dumps. See [Database Backups](#database-backups) below.

Instance backups made from the Admin Dashboard are written to `backend/backups/`, **not** inside `uploads/`: a backup holds every credential on the instance, while `uploads/` is media you may sync anywhere. Versions before 1.5.0 wrote them to `backend/uploads/backups/`; if you have backups there, move them to `backend/backups/`, which is the only directory the dashboard lists now. Both folders belong to the container's user, so on Docker the move needs `sudo`, run through `sh -c` so that the `*` is read by an account that can see into the folder, and the `chmod` makes the moved backups readable by that user alone, as new ones are:

```bash
sudo sh -c 'mv backend/uploads/backups/*.zip backend/backups/ && chmod 600 backend/backups/*.zip'
```

Without Docker, `backend/backups/` appears the first time the Backups tab is opened; to move them before that, create it with `mkdir -p backend/backups && chmod 700 backend/backups`, then run the part in quotes on its own, without `sudo sh -c`.

On an install without Docker the backend writes them to a `backups` folder in its working directory (`backend/backups`, beside `uploads`); set the `BACKUP_DIR` environment variable to put them somewhere else. A folder inside the uploads directory is refused, and the backend will not start with one. The Docker setup keeps them at `backend/backups/` on the host and does not pass `BACKUP_DIR` through.

Because a backup holds every credential on the instance, the backend keeps the folder and each file in it readable by its own user alone (the folder is mode `700`, each backup `600`), and `backup.sh` does the same for its folder and the dumps in it, including any an earlier version left readable. While a backup or a restore runs, the working copy of the database it keeps in the system's temporary folder (`/tmp` unless `TMPDIR` says otherwise) sits in a folder of its own with the same protection, and is removed when it finishes, whether it worked or not. On a Docker host that user is the container's `appuser`, so copying a backup off the machine by hand needs `sudo`; downloading it from the dashboard needs nothing. The database password is never on a tool's command line either: `pg_dump` and `psql` read it from their environment, where the process list cannot show it.

If the backend is stopped part-way through a backup or a restore (killed, or the machine loses power), its temporary folder (`cozyvtt-db-…` or `cozyvtt-restore-…`) is left behind: on Docker it stays in the container's `/tmp` until the container is recreated, for example with `docker compose up -d --force-recreate backend`, and on a manual install until you delete it.

For large or multi-server deployments, consider mounting an S3-compatible object store (MinIO, AWS S3) as a FUSE filesystem at `backend/uploads/`. No code changes required.

---

## Per-User Permissions

Beyond the platform role (Admin / User), two permissions are granted individually from **Admin Dashboard → Users**, as pill toggles beside each user's role. Both default to off, including on upgrade, and neither appears for admins, who have both implicitly.

| Permission | Grants |
|---|---|
| **Global Assets** | Upload, re-scope and delete instance-wide assets that every user can see |
| **Templates** | Edit or delete anyone's character template, not just their own — for curating what users have published |

Grant these sparingly: both write content visible to every user on the instance. Revoking either takes effect on the user's next request; they do not need to sign out.

The **USER** / **ADMIN** pill beside a name changes that person's role, and it asks first: making someone an administrator spells out what that gives them, and taking it away says they lose the Admin Panel. Nothing changes until you confirm.

An instance always keeps at least one admin. While you are the only one, you cannot remove your own admin role or delete your own account; promote another user to **Admin** first. Nothing else can make someone an admin once setup has run, so this is what stops an instance ending up with nobody able to manage it.

---

## Database Backups

### Via Admin Dashboard

**Admin Dashboard → Backups → Create Backup** generates a ZIP holding a `pg_dump` of the database and every uploaded file, which you can download for offsite storage. It is written to `backend/backups/` on the host, which the backend creates and takes ownership of on its first start, so there is nothing to make by hand. The bin beside a backup in the list deletes that file for good; it asks first, naming the file.

To keep them in another folder under Docker, name that folder in a small file of your own, `docker-compose.override.yml`, next to `docker-compose.yml`. Docker Compose reads it automatically on top of the shipped file, and `git pull` never touches it.

**Do not start from `docker-compose.override.example.yml` for this.** That example is for running your own reverse proxy: it switches off the bundled nginx, and on a default install that takes your site offline.

First, check whether you already have an override file. From the CozyVTT folder:

```bash
ls docker-compose.override.yml
```

**If it says `No such file or directory`** (the usual case on a default install), create the file with only these lines, using your own folder in place of `/srv/cozyvtt-backups`:

```bash
cat > docker-compose.override.yml <<'EOF'
services:
  backend:
    volumes:
      - /srv/cozyvtt-backups:/app/backups
EOF
```

**If it prints `docker-compose.override.yml`**, you already have one, usually from setting up an external reverse proxy. Do not run the command above, which would replace it. Open it in a text editor instead (for example `nano docker-compose.override.yml`) and add the two `volumes:` lines to its `backend:` section, lined up with `ports:`, leaving everything else as it is; a second `backend:` does not work. With the example file's proxy settings, the result looks like this:

```yaml
services:
  nginx:
    profiles: ["disabled"]
  backend:
    ports:
      - "127.0.0.1:4000:4000"
    volumes:
      - /srv/cozyvtt-backups:/app/backups
  frontend:
    ports:
      - "127.0.0.1:8080:80"
```

Your line names the same place inside the container as the shipped `./backend/backups` line (`/app/backups`), so it replaces that line instead of adding to it. Apply it and check the result:

```bash
docker compose up -d
docker compose config | grep -B1 'target: /app/backups'
```

It should print your folder once, like this:

```
        source: /srv/cozyvtt-backups
        target: /app/backups
```

On a default install, also check the site is still up:

```bash
docker compose config --services
```

The list should include `nginx`, the bundled web server that answers your visitors. If it is missing, your override file is switching nginx off (it holds the `profiles: ["disabled"]` line from the example file); take the `nginx:` line and the `profiles:` line under it out of the file and run `docker compose up -d` again.

The backend takes ownership of the new folder when it starts and makes it private to itself. On a NAS or USB drive that does not accept Linux owners or permissions, it cannot; it still starts, and its log (`docker compose logs backend`) says so. Backups there are then readable by whoever can read that drive, so choose one only you can reach. Backups already in `backend/backups/` stay there; to move the ones you want to keep:

```bash
sudo sh -c 'mv backend/backups/*.zip /srv/cozyvtt-backups/'
```

**Do not pick a folder inside `backend/uploads/`.** A backup holds every credential on the instance, and `uploads/` is the folder you may sync or copy anywhere. Under Docker nothing stops you: the backend sees only its own `/app/backups` and cannot tell where that is on the host. `BACKUP_DIR` applies only to an install without Docker, and there a folder inside the uploads directory is refused.

**Admin Dashboard → Backups → Restore** replaces the database with the backup's, copies the backup's uploaded files over the existing ones (a file the backup does not have is left where it is), then runs this version's migrations, so a backup from an older CozyVTT can be restored into a newer one and is brought up to date on its own.

Before anything is touched, the file is checked: it has to be a complete `pg_dump` of a CozyVTT database, holding nothing but SQL. An empty, cut-short or unrelated file is refused with the reason on screen, and nothing has changed. A backup of the database as it is at that moment is then written to the backup list (database only, named like any other backup), so restoring the wrong file can be undone by restoring that one; the restore names it when it finishes. The database is loaded in a single step that is undone as a whole if any part of it fails, so a backup that cannot be applied leaves your existing data untouched, and the reason is in the backend log:

```bash
docker compose logs backend | grep -i restore
```

**If the dashboard cannot back up the database as it is, it restores nothing.** That backup is what lets a restore be undone, so without it the dashboard stops and says so. It happens when the database itself is damaged, or when it runs a newer PostgreSQL than the backend's tools (the log then says `server version mismatch`). If the message names the backups folder instead, the backend cannot write there: fix the folder's owner or free space on its disk and try again, which keeps the undo. The same message, saying nothing was changed, can also come before any of this, when the uploaded backup itself cannot be saved in that folder. To restore anyway, take the database out of the dashboard backup and load it with the restore script, which asks you to confirm and makes no copy first. The commands below read the backup from `backend/backups/`. A backup you uploaded from your own computer is not kept on the server, so copy it there first (for example `scp backup-2026-01-01T03-00-00.zip you@your-server:`) and use its path in place of `backend/backups/…` in both `unzip` lines. With the file in your own home folder, the first `unzip` line needs no `sudo`; keep `sudo` on the second, because on Docker `backend/uploads` belongs to the container's user. From the CozyVTT folder, with the stack running and your backup's name in place of the example:

```bash
(umask 077; sudo unzip -p backend/backups/backup-2026-01-01T03-00-00.zip database.sql | gzip > restore-me.sql.gz)
./backend/scripts/restore.sh restore-me.sql.gz
```

Then put the backup's uploaded files back over the existing ones, restart the backend (which also brings an older backup up to this version), and delete the working copy, which holds every credential:

```bash
sudo unzip -o backend/backups/backup-2026-01-01T03-00-00.zip 'uploads/*' -d backend/
docker compose restart backend
rm restore-me.sql.gz
```

A database-only backup (the kind a restore makes first) has no uploaded files, and the `unzip` for the uploaded files then says nothing matched; that is expected. If `unzip` is missing, install it (`sudo apt install unzip` on Debian or Ubuntu). Without Docker, run `restore.sh` with `DATABASE_URL` set, as in [Via the included scripts](#via-the-included-scripts), unpack the uploaded files into your uploads folder, run `cd backend && npx prisma migrate deploy` to bring an older backup up to this version (without Docker the backend does not do this when it starts), and restart the backend the way you run it.

**A restore signs everyone out.** Backups made from now on leave the login sessions out, a restore empties whatever sessions an older backup carried, and every open game connection is dropped as soon as the backup is loaded, even if bringing it up to this version fails afterwards, so a sign-in that was ended after the backup was made (a password change, a removed account) cannot come back with it. Everyone signs in again afterwards.

**Restore only backups made by this dashboard or by the backup script, on an instance you trust.** A backup is a set of instructions the database carries out with its owner's full rights. The restore refuses the database tool's own commands, and a line that starts with a copy statement that is not table data, but it cannot tell harmless SQL from harmful SQL. A file made to do harm can put anything at all in your database, and on the Docker setup it can also run programs inside the database container.

A backup restores onto an instance whose database user has a different name, which is what moving to a new machine with a fresh `.env` produces: everything in it ends up owned by the instance's own database user. Restoring drops and recreates the database's `public` schema, which needs the database role to own the database and that schema. The Docker setup does that for you. On a manual install, make sure of it once, using your own database and user names if you chose different ones (in each command the `cozyvtt` after `-d` or `DATABASE` is the database, the one after `TO` the user). The second command is needed on PostgreSQL 14, and on a database first created on 14 and upgraded since; on newer ones it does no harm:

```bash
sudo -u postgres psql -c "ALTER DATABASE cozyvtt OWNER TO cozyvtt;"
sudo -u postgres psql -d cozyvtt -c "ALTER SCHEMA public OWNER TO cozyvtt;"
```

A manual install also needs a `psql` from August 2025 or later (PostgreSQL 13.22, 14.19, 15.14, 16.10, 17.6, or any 18): the restore runs in psql's restricted mode, which older releases do not have. With an older one the restore stops before changing anything, and the log says `invalid command \restrict`. The Docker image already has a recent one.

### Via the included scripts

Run these from the folder you installed CozyVTT into, with the stack running:

```bash
# Create a backup — written to ./backups/cozyvtt_YYYYMMDD_HHMMSS.sql.gz
./backend/scripts/backup.sh

# Restore one (this REPLACES the current database — it asks you to confirm)
./backend/scripts/restore.sh ./backups/cozyvtt_20260101_030000.sql.gz
```

Both notice that you are running under Docker and do the work inside the
database container, so you do **not** need PostgreSQL installed on the host.
Backups older than 30 days are pruned; set `BACKUP_RETAIN_DAYS` to change that.

**A restore either works completely or changes nothing.** The restore script
checks the backup file before it touches your database: the archive has to be
whole, and what is inside has to be a complete backup of a CozyVTT database
holding nothing but SQL. Anything else is refused with the reason, and nothing
has changed. It then replaces the database's contents in a single step that is
undone entirely if any part of it fails, so a backup that cannot be applied
leaves your existing data as it was. Ownership and permission lines from
another instance are ignored, as the dashboard ignores them, so a backup made
under a different database user name still restores. Like the dashboard, the
script runs `psql` in its restricted mode, which needs a PostgreSQL release
from August 2025 or later; on Docker that is the database container's own
`psql`, and `docker compose pull database` followed by
`docker compose up -d database` brings an older image up to date.

**Restart the backend as soon as a restore finishes.** The restore empties the
login sessions an older backup carried, as part of that same single step, so
every sign-in has ended and everyone signs in again. The script cannot reach
the running backend, though: a game table that is already open keeps its live
connection, with the identity and campaign role it had before the restore,
until the backend restarts. The restart also brings a backup from an older
CozyVTT up to this version. The script prints the command when it finishes:

```bash
docker compose restart backend
```

Without Docker, run `cd backend && npx prisma migrate deploy`, then restart the
backend the way you normally start it.

The script unpacks the whole backup into a working file before it loads
anything, in `/tmp` unless `TMPDIR` says otherwise, so that folder needs room
for the unpacked backup, which can be several times the size of the `.sql.gz`.
Where `/tmp` is small (it is held in memory on some systems), point it
somewhere with more room:

```bash
TMPDIR=/var/tmp ./backend/scripts/restore.sh ./backups/cozyvtt_20260101_030000.sql.gz
```

If you run CozyVTT without Docker, give them a `DATABASE_URL` instead:

```bash
DATABASE_URL="postgresql://user:pass@host:5432/cozyvtt" ./backend/scripts/backup.sh
```

Under Docker, the scripts take the database's user and name from
`DATABASE_USER` and `DATABASE_NAME` in their environment, not from `.env`, and
assume `cozyvtt` for both. If you changed either in `.env`, put the same values
in front of the command, for example:

```bash
DATABASE_USER=myuser DATABASE_NAME=mydb ./backend/scripts/backup.sh
```

### Via Command Line

If you would rather not use the backup script, this one command makes the same
backup by hand (with the default `cozyvtt` names; put yours in place of both if
you changed them):

```bash
(umask 077; docker compose exec -T database \
  pg_dump -U cozyvtt -d cozyvtt --no-owner --no-privileges \
    --exclude-table-data=public.session \
  | gzip > backup_$(date +%Y%m%d_%H%M%S).sql.gz)
```

The `umask 077` in brackets makes the file readable by you alone, as the script's are: it holds every password hash and MFA secret on the instance.

`--exclude-table-data=public.session` leaves the login sessions out, as the
dashboard and the script do, so restoring the file cannot sign back in someone
who was signed out after it was made.

To restore it, use `restore.sh` from the section above, which accepts this file
too. Piping this file straight into `psql` does not replace anything on an
instance that is already set up: its tables already exist, so the load fails,
and depending on the options it either changes nothing or leaves a mix of old
and new rows. `restore.sh` replaces the tables first, loads the backup in one
step that is undone if any part fails, and empties the login sessions.

### Automated Daily Backups (cron)

Run the backup script from cron. It keeps 30 days of backups in `./backups`,
like it does when you run it by hand:

```bash
crontab -e

# Add this line: daily at 3 AM, with the output kept in backup.log
0 3 * * * cd /path/to/cozyvtt && ./backend/scripts/backup.sh >> backup.log 2>&1
```

Put the folder you installed CozyVTT into in place of `/path/to/cozyvtt`, and
the `DATABASE_USER=... DATABASE_NAME=...` prefix in front of the script if you
changed those names. The user whose crontab this is needs to be able to run
`docker compose` without `sudo`.

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

Docker keeps each container's log in up to five files of 10 MB and deletes the oldest as it goes, so these logs cannot fill the disk. The limit is set by the `logging:` lines in `docker-compose.yml`. If you send container logs elsewhere with a different Docker log driver, set `logging:` for each service in your `docker-compose.override.yml`.

### Persistent Log Files

The backend writes structured JSON logs to `backend/logs/` on the host:

- `backend/logs/combined.log` — all log levels
- `backend/logs/error.log` — errors only

The backend rotates these files itself. When one reaches 10 MB it becomes `combined1.log` (or `error1.log`), the older ones move up a number, and the fifth and oldest is deleted, so the two logs take about 100 MB at most. The newest lines are always in the file without a number. There is nothing to set up: do not add a `logrotate` rule for this folder. If you added one for an earlier version, remove it. The backend keeps its files open, so a rule that renames them leaves it writing to the renamed file, and the space is not freed.

Each line is one JSON object. An error is written with its message and its stack trace (the list of places in the code it passed through), which is what makes a log worth attaching to a bug report:

```json
{"err":{"name":"PrismaClientInitializationError","message":"Can't reach database server at `database:5432`","stack":"PrismaClientInitializationError: Can't reach database server ..."},"level":"error","message":"Error adding token","timestamp":"2026-01-01T00:00:00.000Z"}
```

To see the most recent errors:

```bash
tail -n 20 backend/logs/error.log
```

**What the logs hold.** Email addresses are cut to their first letter and their domain, such as `a***@example.com`, which is enough to tell accounts apart. Accounts, campaigns and maps are mostly named by their internal ids, and a few lines include a campaign's name. A value longer than 8,000 characters keeps only its first and last 4,000, so one oversized request cannot produce a huge line. The database's own errors are logged the same way, as `Database error` lines whose `target` names the kind of record and the operation, such as `character.findUnique`. Log files written by older versions can still hold full email addresses. To remove them, stop the backend, delete the files, and start it again; it begins new ones:

```bash
docker compose stop backend
sudo rm backend/logs/*.log
docker compose start backend
```

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

This endpoint lives on the **backend**. The bundled Nginx forwards it, so on a default install it answers on the site's own address, which is what to point an uptime monitor at:

```bash
curl -s http://localhost/health
```

It is also reachable from inside the stack, which works whatever proxy is in front:

```bash
docker compose exec backend wget -qO- http://localhost:4000/health
```

Docker already runs this check for you every 30 seconds; `docker compose ps` shows the backend as `healthy` or `unhealthy` based on it.

If you run your own reverse proxy and want an uptime monitor to reach `/health` from outside, add a route for it alongside your `/api` route, both pointing at the backend.

### Database Connectivity

```bash
docker compose exec database pg_isready -U cozyvtt
```

---

## Troubleshooting

### A brand-new install shows the login page instead of the setup wizard

…and going to `/setup` sends you straight back to the home page.

**Cause:** your `/api` requests aren't reaching the backend, so the app can't tell that this is a new installation. Almost always a reverse-proxy routing problem, not a CozyVTT problem.

**Check it:**

```bash
curl -s -w '\n%{http_code} %{content_type}\n' https://your-domain.com/api/setup/status
```

Look at the last line it prints:

| What you see | What it means | Fix |
|---|---|---|
| `200 application/json; charset=utf-8` | The API is fine — the problem is elsewhere | Check `docker compose logs backend` |
| A web page, then `200 text/html` | `/api` is being answered by the web pages instead of the backend | Add the `/api/...` → backend route to your proxy |
| `502 …`, or `000` (no connection at all) | Nothing is listening where your proxy points | Open the backend port — see [Option A](#option-a--remove-the-nginx-service-most-common) step 2 |

### Setup fails with "An error occurred during setup" (502)

Same root cause as above: the browser reached the wizard (served by the frontend), but the request that creates your admin account goes to the backend, which your proxy can't reach. Run the same check.

If you removed the bundled `nginx` service, the usual culprit is a missing `ports` entry on the **backend** service — it is `expose`-only by default, which means "reachable from other containers" but not from your proxy.

### The site answers 502 after `docker compose up -d` recreated the backend

The bundled nginx looks the backend and frontend up again within ten seconds of either being recreated, so this clears by itself. If it does not, your `nginx/nginx.conf` is an older or edited copy that still names `http://backend:4000` in its `proxy_pass` lines: when `docker compose up -d` recreates only the backend (after you change `.env`, for example), nginx keeps using the old container's address, and everything sent to the backend answers **502 Bad Gateway**. The pages load, but signing in fails, while `docker compose ps` shows the backend as `healthy`. Restart nginx so it finds the new one:

```bash
docker compose restart nginx
```

It ends by printing `Container cozyvtt-nginx  Started`, and the site answers normally again. To stop it happening, bring your copy up to date with the `git stash` steps in [Updating after you've edited `docker-compose.yml`](#updating-after-youve-edited-docker-composeyml), which work the same for `nginx/nginx.conf`.

### Live features don't work (dice, token movement, chat)

The page loads and you can log in, but nothing updates in real time. Your proxy is routing `/api` but not `/socket.io`. Add the `/socket.io/...` → backend route, and make sure your proxy allows WebSocket upgrades.

### `git pull` refuses to update because of local changes

```
error: Your local changes to the following files would be overwritten by merge
```

You edited a tracked file (usually `docker-compose.yml`). See [Updating after you've edited `docker-compose.yml`](#updating-after-youve-edited-docker-composeyml).

### Uploads fail on large files

Check [Upload Size Limits](#upload-size-limits). The backend logs its effective limits at startup and warns when your proxy's body limit is smaller than they are:

```bash
docker compose logs backend | grep -i "upload limits"
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

> **Back up before you upgrade.** See [Database Backups](#database-backups): one command, `./backend/scripts/backup.sh`, and back up `backend/uploads/` alongside it.

### One-off data migration (only if upgrading from before 1.3.0)

**None of 1.4.0, 1.5.0 and 1.5.1 needs a manual step here**: their database migrations run automatically and change no existing data, and 1.5.1 has none. (1.5.0 has four things to know after the upgrade, all in the changelog's upgrade note: backups now live in `backend/backups/`, MFA backup codes must be regenerated, a production instance refuses to start while `DATABASE_PASSWORD` is still the placeholder, and an install without Docker needs the database role to own the database before a backup can be restored.) This section applies only if you have characters created on a version **before 1.3.0** and never ran it.

Characters made from the built-in templates of those versions keep some of their content in fields the sheet no longer reads: a Pathfinder 2e character's strikes and class features, and a D&D 5e character's languages, personality traits, ideals, bonds, flaws and allies. Saving a character moves its own content to the right place. Until a character is saved or moved, though, a Pathfinder 2e sheet shows no strikes or class features. Run this once to move every character at once:

```bash
# See what would change, without writing anything
docker compose exec backend node dist/scripts/migrate-sheet-fields.js --dry-run

# Apply
docker compose exec backend node dist/scripts/migrate-sheet-fields.js
```

Without Docker, run the same two commands from the `backend` folder, without `docker compose exec backend`. (`npm run migrate:sheet-fields` works only in a development checkout; the production image does not include the tool it needs.)

What to expect:

- The dry run prints how many characters it looked at, then each character it would change, with its name, game system and id, and a line for each change, for example `moved 2 attack(s) to strikes`.
- Nothing is deleted that has not been moved. Where a character already has its own text, the older text is added after it, and where there is no room for it, for example a second player name, the old field is left as it is and the character is listed under "keep something in an older field" so you can look at it.
- You do not need to stop the stack. A player who saves, or a DM who changes hit points, while it runs keeps that change.
- If it prints an error, or says a character changed while being written, it ends with an error status; run it again. Running it twice is harmless.

Details in
[backend/DATABASE_MIGRATIONS.md](../backend/DATABASE_MIGRATIONS.md).

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

Coming from 1.4.0 or earlier, also make the database role the owner of the database and its `public` schema once, so a backup can be restored (see [Database Backups](#database-backups)); use your own names if you changed them:

```bash
sudo -u postgres psql -c "ALTER DATABASE cozyvtt OWNER TO cozyvtt;"
sudo -u postgres psql -d cozyvtt -c "ALTER SCHEMA public OWNER TO cozyvtt;"
```

---

## Hardening Checklist

Before going live:

- [ ] **Strong secret** — `SESSION_SECRET` is a 32+ character random string, not the placeholder value from `.env.example`
- [ ] **Real database password** — `DATABASE_PASSWORD` is not the placeholder from `.env.example`. A production instance refuses to start on it, the same way it does for `SESSION_SECRET`
- [ ] **HTTPS only** — SSL certificate installed; HTTP block in `nginx/nginx.conf` redirects to HTTPS
- [ ] **Firewall** — Only ports 80 and 443 (or your configured `HTTP_PORT`/`HTTPS_PORT`) are publicly reachable; backend (4000) and database (5432) are not exposed to the internet
- [ ] **CORS_ORIGIN** — Set to your specific domain, not a wildcard
- [ ] **Registration** — `allowRegistration` is **off** for private instances. You choose this in the setup wizard, and can change it later in **Admin → Settings**
- [ ] **Admin MFA** — Admin account has MFA enabled
- [ ] **Backups tested** — Automated backups configured and a restore drill completed successfully
- [ ] **Upload isolation** — `backend/uploads/` is served only through authenticated backend endpoints, not directly by the web server
- [ ] **Security headers** — CozyVTT sends its own (Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy) from the container that serves the app page, so they arrive whether you use the bundled Nginx or your own proxy. Confirm with `curl -sI https://your-host/ | grep -i content-security`. If your proxy strips or overwrites response headers, stop doing that. **HSTS is the one you add yourself**, in your HTTPS block — see the commented line in `nginx/nginx.conf`
- [ ] **Database isolation** — PostgreSQL container uses `expose` (not `ports`); unreachable from outside the Docker network
- [ ] **Log size** — Nothing to set up: the backend rotates `backend/logs/` itself and Docker caps each container's log (see [Monitoring and Logs](#monitoring-and-logs)). Remove any `logrotate` rule you added for `backend/logs/`
- [ ] **OS updates** — A plan exists for keeping the host OS and Docker up to date
- [ ] **Brute-force protection** — `fail2ban` (or equivalent) is configured to block IPs hammering `/api/auth/login` and SSH; CozyVTT's own limit is 5 failed sign-ins per 15 minutes per visitor address, but a host-level ban catches scanners earlier
- [ ] **Visitor addresses** — CozyVTT sees each visitor's own address, not your tunnel's or proxy's. Check it as described in [Visitor addresses and sign-in limits](#visitor-addresses-and-sign-in-limits)
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
   > This single rule assumes you kept the bundled `nginx` service, which is the recommended setup — it splits `/api` and `/socket.io` off to the backend for you. **If you removed nginx**, one rule is not enough; you need path-based rules in a specific order, plus published ports. See [Cloudflare Tunnel](#cloudflare-tunnel) under "Using an External Reverse Proxy".
6. Run as a service:
   ```bash
   sudo cloudflared service install
   sudo systemctl start cloudflared
   ```
7. Confirm the API is reachable through the tunnel, not just the web pages:
   ```bash
   curl -s -w '\n%{http_code} %{content_type}\n' https://cozyvtt.example.com/api/setup/status
   ```
   You want a line of JSON and, below it, `200 application/json; charset=utf-8`. Anything else means the tunnel isn't reaching the backend — see [Troubleshooting](#troubleshooting).
8. Confirm CozyVTT sees each visitor's own address and not the tunnel's, with the check in [Visitor addresses and sign-in limits](#visitor-addresses-and-sign-in-limits).

Once running, you can **close ports 80 and 443 on your VPS firewall entirely** — only SSH (port 22, or your chosen alternative) needs to be reachable, and even that you can put behind Cloudflare Access if you want.

### When NOT to use a Cloudflare Tunnel

- You don't trust Cloudflare with TLS termination (they technically see decrypted traffic)
- You have strict data-residency requirements that conflict with Cloudflare's global edge
- You're running on LAN-only — no tunnel needed; just use the local IP or a Tailscale node

Alternatives in the same family: **Tailscale Funnel** (P2P, no third-party termination), **ngrok**, **inlets**, or running your own reverse proxy + WAF (more work, more control).

---

## The API Documentation

CozyVTT keeps a description of its HTTP routes in [`backend/docs/API_DOCUMENTATION.yaml`](../backend/docs/API_DOCUMENTATION.yaml) (an OpenAPI 3.0 file), and of its live-connection events in [`backend/docs/WEBSOCKET_DOCUMENTATION.md`](../backend/docs/WEBSOCKET_DOCUMENTATION.md). They are for developers. Running an instance needs neither, and there is nothing to set up or host.

They describe what the web client calls. That is **not a public API**: it is not versioned, carries no compatibility promise, and can change in any release. A program can still use it by signing in as a user, and it then acts with that user's permissions. The [Community Projects](../README.md#community-projects) section of the README says more.

### Reading it

The YAML file is plain text and reads fine in any editor. For a formatted view, either:

- open [editor.swagger.io](https://editor.swagger.io) and paste the file in, or
- with Node.js installed, build a single page from the CozyVTT folder and open it in your browser:

  ```bash
  npx @redocly/cli build-docs backend/docs/API_DOCUMENTATION.yaml --output api-docs.html
  ```

There is no need to serve it from your instance. The bundled nginx only sees its own configuration and certificates, so a page on the host is not reachable through it anyway.

### Hiding it is not a protection

The routes are the same whether the file is published or not, since the web client's own code shows them to anyone who loads the page. What protects an instance is:

- every request is checked on the server: that the caller is signed in, their role in the campaign, and that they may touch what they ask for (`backend/src/middleware/` and `backend/src/services/permissions.ts`)
- rate limits: 5 failed sign-ins per 15 minutes and 10 new accounts per hour from one address, 300 requests a minute from one address, 30 uploads a minute per user, 20 campaign imports, 20 import previews and 20 campaign exports an hour per user, one at a time, and a limit per account on every kind of event sent to the live table (chat, dice, token moves, the DM's controls), set far above what a game sends
- uploads checked by what the file contains, not by its name or the type it claims
- Argon2id password hashing and a strong `SESSION_SECRET`
- security headers on every response: from helmet on the API, and from the bundled nginx on the app page
