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
9. [Per-User Permissions](#per-user-permissions)
10. [Database Backups](#database-backups)
11. [Monitoring and Logs](#monitoring-and-logs)
12. [Troubleshooting](#troubleshooting)
13. [Updating CozyVTT](#updating-cozyvtt)
14. [Hardening Checklist](#hardening-checklist)
15. [Cloudflare Tunnel (Recommended for Public Instances)](#cloudflare-tunnel-recommended-for-public-instances)
16. [The API Documentation](#the-api-documentation)

---

## Requirements

- A Linux server (Ubuntu 22.04 LTS recommended)
- Docker 24+ and Docker Compose v2
- A domain name pointing to your server's IP (optional for LAN-only use)
- At least 1 GB RAM; 2 GB recommended for comfortable operation

Once it is built, CozyVTT needs no internet access to run, and visitors' browsers contact no site but yours: the pages, pictures and fonts all come from your own server. Building the images downloads software, and the Creature Library's **Import D&D 5e SRD** button fetches the creatures from Open5e (api.open5e.com) when an administrator presses it; email is sent only through the SMTP server you configure.

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

Edit `.env` and fill in all required values. At minimum (with `NODE_ENV=production`, the app refuses to start while `DATABASE_PASSWORD` is still the placeholder from `.env.example`, and while `SESSION_SECRET` is a placeholder, is the example value shown here, or is shorter than 32 characters):

```env
# Database — paste the output of: openssl rand -hex 16
DATABASE_PASSWORD=<paste the 32 characters that command prints>

# Security — paste the output of: openssl rand -hex 32
SESSION_SECRET=<paste the 64 characters that command prints>

# Your public URL (used for CORS and email links)
CORS_ORIGIN=https://your-domain.com

NODE_ENV=production
```

**Use letters and digits only in `DATABASE_PASSWORD`**, which is what `openssl rand -hex 16` gives you. The stack writes the password into the database's address, so a character such as `/`, `#`, `?` or `%` breaks that address. The database container still starts and looks healthy, but the backend cannot connect: `docker compose logs backend` shows `Database connection successful`, because that first check does not use the password, and then `Migration failed`, and the container keeps restarting. If you see that, check the password's characters first. A `$` has a different problem: Docker Compose reads a `$` in `.env` as the start of a variable name, so the password it uses is not the one you typed.

`CORS_ORIGIN` is also the only other address a browser page may make changes from. A page on any other address, another port on the same server included, is refused if it tries to sign in, save or delete anything as whoever is signed in. CozyVTT serves the app and its API from one address, as the bundled nginx and every setup in this guide do, so that check needs nothing from you. Set `CORS_ORIGIN` to the address your players type, `https://`, host and any port included: email links are built from it unless you set `APP_URL`.

### Changing the database password

The database image reads `POSTGRES_PASSWORD` only when it creates an empty database, so on an instance that has already run, changing `DATABASE_PASSWORD` in `.env` on its own locks the backend out: the database keeps the old password and the backend connects with the new one. This is what happens if you upgrade with the placeholder still in place and the backend stops with `DATABASE_URL uses the placeholder password from .env.example` in `docker compose logs backend`.

Change it inside the database first, with the stack up (the database container runs even while the backend refuses to start):

```bash
NEW_PASSWORD=$(openssl rand -hex 24)
docker compose exec database psql -U cozyvtt -d cozyvtt -c "ALTER USER cozyvtt WITH PASSWORD '$NEW_PASSWORD';"
echo "$NEW_PASSWORD"
```

The command uses the default names. If you changed them in `.env`, put your `DATABASE_USER` in place of `cozyvtt` after `-U` and after `ALTER USER`, and your `DATABASE_NAME` in place of `cozyvtt` after `-d`. Then put the printed value in `.env` as `DATABASE_PASSWORD`, and restart. The stack builds the database's address from it, so there is no `DATABASE_URL` to change in `.env` (a line you added there is ignored on Docker):

```bash
docker compose up -d
```

A hex password avoids any quoting trouble in the command above and in `.env`, and the characters that break the database's address. On a manual install the same `ALTER USER` runs through `sudo -u postgres psql`, as in the install steps below, and the new password goes in `DATABASE_URL` in `backend/.env`.

### 3. Build and start the stack

```bash
docker compose up -d --build
```

This starts four containers on an isolated internal network:
- `cozyvtt-database` — PostgreSQL 15 (internal only, not exposed to host)
- `cozyvtt-backend` — Express API on internal port 4000
- `cozyvtt-frontend` — React SPA served by Nginx on internal port 80
- `cozyvtt-nginx` — Reverse proxy, the only container with public ports (80 and 443)

Every container runs with Docker's `no-new-privileges` option, so no program in it can gain privileges, and with only the few Linux capabilities (the separate powers root normally holds) that its start-up needs, such as giving a folder to the right owner or switching to an unprivileged user. The frontend container's files are read-only: it only serves the built app, and nginx keeps its scratch files in memory. So are the proxy's (`cozyvtt-nginx`): it writes its settings, rendered from `nginx/nginx.conf` as it starts, to memory, and keeps large uploads and downloads as they pass on a volume of its own, `nginx_temp`, which Compose creates on the first start and which needs no backup. The backend's files are read-only as well, apart from `backend/uploads`, `backend/backups` and `backend/logs` and its `/tmp`, where a backup or a restore keeps its working copy of the database: a volume of its own, `backend_tmp`, created on the first start like `nginx_temp`, with nothing in it to back up. The backend starts as root only long enough to give its mounted folders the right owner, then runs as an unprivileged user, `appuser`. Commands you run inside the backend container take `-u appuser`, as every one in this guide does: root in that container cannot write the backend's files.

Database migrations run automatically when the backend starts.

### 4. Complete the setup wizard

Until the wizard has run, whoever submits it becomes the instance's administrator. So the wizard asks for a **setup token** that only you can read: the backend prints one in its log when it starts and setup is not yet complete.

1. Get the token from the backend log:

   ```bash
   docker compose logs backend | grep "setup token"
   ```

   You should see one line containing a 32-character code, such as (in production the line is JSON, with the timestamp after the message)
   `Setup is not complete. The setup wizard asks for this setup token: 3f9c2a7d1b8e4c6f0a5d9e2b7c1f4a8d`.
   If the line is missing, the backend may still be starting; wait a few seconds and run it again. The token is new on every start of the backend until setup is complete, so copy it from the latest line. If it is still missing (the backend could not read its settings while it started, or `LOG_LEVEL` hides warnings), go through the wizard with anything typed into **Setup token** and press **Complete Setup** on the last step: the wizard refuses it, and the backend prints the token again, as `The setup wizard was refused: the setup token was missing or wrong. The setup wizard asks for this setup token: ...`, in a line every `LOG_LEVEL` shows.

2. Navigate to `http://your-server` (or `http://localhost` if testing locally). The wizard opens by itself on a fresh install.

3. On the **Create Admin Account** step, paste the token into **Setup token**, fill in your administrator account, and finish the wizard.

If you would rather choose the token yourself, set `SETUP_TOKEN=your-value` in `.env` before starting the stack; the log then says to use that value instead of printing one. The token has no use once setup is complete.

> **Finish setup before you share the address.** A fresh instance reachable from the internet is found by scanners within minutes. The token stops a stranger from taking the administrator account, but the sooner the wizard is done the better.

### 5. Verify the stack

```bash
# Check all containers are healthy
docker compose ps

# Confirm migrations ran
docker compose logs backend | grep -i migrat

# Health check (returns {"status":"healthy",...})
docker compose exec -u appuser backend wget -qO- http://localhost:4000/health

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

Stopping the backend takes about a second. It finishes the requests it is answering, disconnects everyone at the table (their browsers reconnect by themselves once it is back), closes its database connections, and exits. Anything still running after 8 seconds, such as a large download, is cut off and the backend exits anyway. A backend run without Docker stops the same way on Ctrl+C or when a service manager such as systemd or pm2 stops it.

**While the Admin Dashboard is making a backup, stopping waits for it.** The backend takes no new requests, lets the backup finish for up to 10 minutes, and then stops as above. `docker compose stop`, `restart` and an upgrade's `up -d --build` show the backend as stopping until then, and `docker compose logs backend` says `A backup is being written; waiting up to 10 minutes for it to finish before stopping`. `docker-compose.yml` lets the backend take ten and a half minutes to stop before Docker forces it. A backup still unfinished after 10 minutes is lost, and the log says so; make it again once the backend is back.

**Deleting an account removes its files just after the page confirms it.** If the backend is stopped in those seconds it waits up to 4 seconds for the removal to finish. Files it did not reach stay as assets with no owner, which an administrator can find with the **No Uploader (account deleted)** filter on the **Assets** tab of the Admin Panel and delete.

---

## Port Configuration

By default, the Nginx container binds to host ports **80** (HTTP) and **443** (HTTPS). If those ports are already in use, set `HTTP_PORT` and/or `HTTPS_PORT` in your `.env`:

```env
# Access CozyVTT at http://yourserver:8080
HTTP_PORT=8080
HTTPS_PORT=8443
```

The defaults (`80`/`443`) apply if these variables are not set. Run `docker compose up -d` after changing them.

Put the port in `CORS_ORIGIN` too, for example `CORS_ORIGIN=http://yourserver:8080`: email links are built from it, and without the port they lead to port 80. With HTTPS on another port, put that port in the `return 301` line of your `nginx/conf.d/https.conf` as well (`return 301 https://$host:8443$request_uri;`), or visitors who type `http://` are sent to port 443.

A value can also start with an address, which publishes the port on that address alone. `HTTP_PORT=127.0.0.1:80` keeps it to this server, which is what a tunnel on the same server wants (see [Visitor addresses and sign-in limits](#visitor-addresses-and-sign-in-limits)).

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

   CozyVTT sets these on the frontend container, so removing the bundled Nginx does not lose them — a proxy passes response headers through by default. If nothing comes back, your proxy is stripping or replacing them; see `frontend/security-headers.conf` for the policy CozyVTT sends, and copy it into whatever your proxy sets instead. Everything the page loads comes from your own instance, so the policy names no other site.

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

This is also the option that keeps upload limits (`NGINX_MAX_BODY_SIZE`) working without extra configuration. So that nginx believes the tunnel about each visitor's address and about HTTPS, add `NGINX_TRUSTED_PROXIES=172.16.0.0/12` to `.env` (the range on most servers; [check yours](#the-range-for-a-proxy-on-the-same-server)), and keep nginx's ports to this server with `HTTP_PORT=127.0.0.1:80` and `HTTPS_PORT=127.0.0.1:443`, as [Visitor addresses and sign-in limits](#visitor-addresses-and-sign-in-limits) explains.

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

Wrong passwords are also counted for the account itself, whatever addresses they come from: ten in an hour for one email address, and that account refuses sign-in for an hour, from everywhere, with "Too many failed sign-ins for this account, please try again later". A new password opens the account at once, whether the owner sets it with the **Forgot password?** link, you give them a temporary one from **Admin → Users**, or they change it from a device still signed in. You can also open it without changing the password: a locked account shows **Locked until** on its row in **Admin → Users**, and **Clear lock** there clears it after asking. The counts are kept in memory, so restarting the backend also clears them. Each time an account locks, a line appears in **Admin → Activity**, so you can see when someone is guessing at your users' passwords.

The two-factor code (the six-digit code from an authenticator app, or a backup code, asked for after the password on accounts that use two-factor sign-in) has a separate limit: five wrong codes in fifteen minutes from one visitor, and five for one account from anywhere. Only a wrong code counts, so people signing in together behind one address are all let through, exactly as with passwords.

Both limits tell visitors apart by their *IP address*, the address their device connects from, so CozyVTT has to see each visitor's own address and not your tunnel's or proxy's. So does the general limit of 300 requests a minute from one address (`RATE_LIMIT_MAX_REQUESTS`, see [Other settings](#other-settings)), which counts every request the app makes, each picture on a map included. A visitor who connects over IPv6 usually has a whole block of addresses from their internet provider, so all of these limits count every address in one block (a /56 network, the addresses that share their first 56 bits) as one visitor.

**With the bundled nginx, a visitor who connects straight to your server is counted by their own address.** When a tunnel or another proxy stands in front of nginx, every request reaches nginx from that proxy, and nginx has to be told it may believe what the proxy says. A proxy names the visitor it is passing along in a header called `X-Forwarded-For`, and says whether the visitor used HTTPS in `X-Forwarded-Proto` (which decides whether CozyVTT marks the sign-in cookie as HTTPS-only). Anyone can send those headers, so nginx believes them only from the addresses you list in `NGINX_TRUSTED_PROXIES` in `.env`. From anyone else it ignores them, so a visitor from the internet cannot pretend to be someone else.

| Your setup | Line to add to `.env` |
|---|---|
| Visitors connect straight to your server, with no tunnel or proxy in front of nginx | none |
| A Cloudflare Tunnel or another proxy on the same server, installed on it or in a Docker container | `NGINX_TRUSTED_PROXIES=172.16.0.0/12` on most servers; [check yours](#the-range-for-a-proxy-on-the-same-server) |
| A proxy on another machine on your network | its address, for example `NGINX_TRUSTED_PROXIES=192.168.1.10` |
| Cloudflare's proxy (the orange cloud) pointed at your server's public address, without a tunnel | Cloudflare's address ranges from [cloudflare.com/ips](https://www.cloudflare.com/ips/), all on that one line, separated by spaces |

Several entries can share the line, separated by spaces or commas. Then apply it:

```bash
docker compose up -d
```

`up -d` reads `.env` again and recreates nginx; `docker compose restart` would keep the old setting. An entry that is not an IP address or range is ignored, and `docker compose logs nginx` says which.

Why `172.16.0.0/12` for a proxy on the same server: Docker hands nginx a connection from the server itself, or from another container, from an address on one of its own networks, and Docker numbers its first networks between `172.16.0.0` and `172.31.255.255`. Some servers use other ranges; [The range for a proxy on the same server](#the-range-for-a-proxy-on-the-same-server) below shows how to find yours.

> 🔒 **With a tunnel on the same server, keep nginx's ports to that server.** Docker also hands nginx some connections from outside from its own network's address: a visitor who connects over IPv6, and on Docker Desktop (Windows and Mac) or rootless Docker every visitor. Once you trust that range, such a visitor could choose the address CozyVTT counts them as. A tunnel only needs to reach nginx from the server itself, so publish nginx's ports there alone, with these two lines in `.env`:
>
> ```env
> HTTP_PORT=127.0.0.1:80
> HTTPS_PORT=127.0.0.1:443
> ```
>
> Then run `docker compose up -d`. The tunnel keeps pointing at `http://localhost:80`. A firewall rule is no substitute: Docker's published ports bypass UFW.

To check it, open CozyVTT from a device outside your network (a phone on mobile data, with Wi-Fi off), then run this on the server:

```bash
docker compose logs --tail 5 nginx
```

After the `cozyvtt-nginx |` label, each line starts with the address CozyVTT saw, for example:

```
cozyvtt-nginx  | 203.0.113.25 - - [28/Sep/2026:14:09:46 +0000] "GET /api/auth/me HTTP/1.1" 200 ...
```

You want the phone's public address there. **If it starts with `172.`, `10.` or `192.168.`**, every visitor is being counted as that one address: a few wrong passwords from anyone lock everybody out of signing in for fifteen minutes, and the whole table shares the 300 requests a minute, which a group opening a map with many pictures at once can use up, so the app's requests are refused for the rest of that minute. That happens when:

- **A tunnel or proxy stands in front of nginx and is not listed** in `NGINX_TRUSTED_PROXIES`, or the range you listed does not hold the address shown. Add its line from the table above, or the range [your server uses](#the-range-for-a-proxy-on-the-same-server).
- **Docker hands visitors to nginx from its own address** and there is no proxy in front: Docker Desktop and rootless Docker do this for every visitor, and a server reached over IPv6 does it for those visitors. Listing Docker's range would let them choose their address, so put a [Cloudflare Tunnel](#cloudflare-tunnel-recommended-for-public-instances) or your own proxy in front instead, set up as above.
- **nginx never read the setting**, because `nginx/trusted-proxies.envsh` lost its permission to run (a ZIP download, or a copy through some Windows or NAS file systems, can do this): `docker compose logs nginx | grep "not executable"` then prints a line ending in `Ignoring /docker-entrypoint.d/19-cozyvtt-trusted-proxies.envsh, not executable`, and `chmod +x nginx/trusted-proxies.envsh` followed by `docker compose restart nginx` fixes it.

If the address is one of Cloudflare's own (the ranges on [cloudflare.com/ips](https://www.cloudflare.com/ips/)), Cloudflare's proxy is in front of your server's public address: add those ranges as in the table.

Only list addresses that are your own proxies. Whatever connects from a listed address can choose the address CozyVTT counts it as.

**If you removed the bundled nginx**, the backend takes the **last** address in the `X-Forwarded-For` header your proxy sends as the visitor's own. Proxies add the address they were connected from there, which is right when nothing else stands in front of yours. If something does (Cloudflare's proxy in front of Caddy, say), set your proxy to believe it, or every visitor counts as the same address: `trusted_proxies` in Caddy, `forwardedHeaders.trustedIPs` in Traefik, `set_real_ip_from` in nginx.

#### The range for a proxy on the same server

`172.16.0.0/12` covers the addresses Docker gives its first networks, `172.16.0.0` to `172.31.255.255`. Once those are taken it moves on to ranges starting `192.168.`, and a server whose Docker settings list address pools of their own (`default-address-pools` in `/etc/docker/daemon.json`) often uses ranges starting `10.`. To find the range on your server:

1. Open CozyVTT through your tunnel or proxy, then run this on the server:

   ```bash
   docker compose logs --tail 5 nginx
   ```

   Until nginx believes your proxy, each line starts, after the `cozyvtt-nginx |` label, with the address your proxy reaches nginx from:

   ```
   cozyvtt-nginx  | 192.168.16.1 - - [28/Sep/2026:14:09:46 +0000] "GET /api/auth/me HTTP/1.1" 200 ...
   ```

   If that address starts with `172.16.` up to `172.31.`, `172.16.0.0/12` covers it and you are done.

2. Otherwise, ask Docker for the range of the network that address is on. This prints the name of CozyVTT's network:

   ```bash
   docker inspect cozyvtt-nginx --format '{{range $name, $net := .NetworkSettings.Networks}}{{$name}} {{end}}'
   ```

   It prints something like `cozyvtt_internal`, where the first part is the name of the folder CozyVTT is in. Put the name it printed in this command:

   ```bash
   docker network inspect cozyvtt_internal --format '{{range .IPAM.Config}}{{.Subnet}} {{end}}'
   ```

   It prints the network's range, something like `192.168.16.0/20` (a second range, with colons, if the network also has IPv6 addresses). If your proxy runs in a container of its own on another Docker network, use that container's name in place of `cozyvtt-nginx` in the first command.

3. Put what it printed in `.env` in place of `172.16.0.0/12`, for example `NGINX_TRUSTED_PROXIES=192.168.16.0/20`, run `docker compose up -d`, and run the check above.

Docker can give a network a new range when it makes it again, after `docker compose down` for example. If the check above shows your proxy's address again after that, look the range up again.

### Minimum proxy requirements

Whatever proxy you use, it must:
- Forward `/api/*` and `/socket.io/*` to the backend, and everything else to the frontend
- Support WebSocket upgrades (`Upgrade: websocket` / `Connection: upgrade`) on the `/socket.io/` path
- Pass `X-Forwarded-Proto` to the backend, and `X-Forwarded-For` with the visitor's own address last (see [Visitor addresses and sign-in limits](#visitor-addresses-and-sign-in-limits))
- Allow request bodies of at least **55 MB** (covers the default `MAX_MAP_SIZE_MB=50` plus overhead), and more if you raise any `MAX_*_SIZE_MB` — see [Upload Size Limits](#upload-size-limits)
- For importing campaigns: allow `/api/campaigns/import` (which also covers `/api/campaigns/import/preview`) a request body of at least **505 MB**, the 500 MB largest archive plus overhead, and give it about **300 seconds** to answer, since a large archive takes minutes to unpack. The bundled nginx allows 512 MB there whatever `NGINX_MAX_BODY_SIZE` says. Without this, importing an archive bigger than your body limit shows "This archive is larger than the server accepts", and a slow import shows an error while the backend carries on and finishes it. Where your proxy can, pass the upload straight through instead of saving it first (`proxy_request_buffering off` in nginx)
- For the Admin Dashboard's backups: allow `/api/admin/backups/restore` a request body as large as your biggest backup (the bundled nginx allows 4 GB), and give both `/api/admin/backups` and `/api/admin/backups/restore` about **600 seconds** to answer (most proxies wait 60). Making or restoring a backup, uploaded files and all, happens inside that one request. Without this, restoring a backup bigger than your body limit fails with **413**, and making a backup that takes longer than your proxy waits shows **504**; the backend carries on, and the backup appears in the list when it is done. Where your proxy can, have it pass the restore upload straight through instead of saving it first (`proxy_request_buffering off` in nginx), so a stranger cannot fill its disk
- Let a large campaign import or backup restore take its time to arrive on a slow connection. CozyVTT itself waits up to an hour for an upload, so it is your proxy's limits that count: give these paths a body timeout that drops a client that **stops** sending, not one that ends a slow but steady upload. nginx's `client_body_timeout` works that way (60 seconds between two pieces of the upload, by default), and the bundled nginx relies on it

Optional: have your proxy compress the backend's answers (gzip for `application/json`), as the bundled nginx does. A map's tokens, walls and fog travel as JSON and shrink to a fraction of their size. The frontend container already compresses the app's own scripts and styles.

> ⚠️ **A proxy that only serves the web pages looks like it works.** If `/api` isn't routed to the backend, those requests come back as the CozyVTT web page itself with a success code, so the site loads normally while every API call quietly fails. Symptoms: a brand-new install shows the login page instead of the setup wizard, and `/setup` bounces straight back to the home page. The `curl` check above tells you in one command.

> ⚠️ **Cloudflare users:** Cloudflare-proxied requests — including Cloudflare Tunnel — are capped at **100 MB** per request body on Free and Pro plans. Uploads above that are rejected at Cloudflare's edge no matter how CozyVTT or your proxy is configured. Cloudflare also gives up on a request that has had no answer for **100 seconds**. Both limits apply to the dashboard's backups: restoring a backup over 100 MB fails at Cloudflare, and making or restoring one that takes longer than 100 seconds shows an error even though the backend carries on. They apply to campaign imports too: an archive over 100 MB cannot be imported through Cloudflare, and a large import may show an error although it finishes. Exports are not affected, because the server starts sending an export straight away. To restore a large backup, copy it to the server and use the restore script steps under [Via Admin Dashboard](#via-admin-dashboard).

### Updating after you've edited `docker-compose.yml`

Once you've changed `docker-compose.yml`, a plain `git pull` will stop and complain, because your changes and ours are both in that file:

```
error: Your local changes to the following files would be overwritten by merge:
        docker-compose.yml
Please commit your changes or stash them before you merge.
```

The same happens if you edited `nginx/nginx.conf`; the message then names that file instead. You no longer need to: HTTPS goes in a file of your own in `nginx/conf.d/` (see [SSL/TLS with Let's Encrypt](#ssltls-with-lets-encrypt)), and a proxy's addresses go in `NGINX_TRUSTED_PROXIES` in `.env` (see [Visitor addresses and sign-in limits](#visitor-addresses-and-sign-in-limits)). If you made either change by editing `nginx/nginx.conf` in an older version, move it with the steps in the 1.5.2 upgrade notes in `CHANGELOG.md`, which put the shipped file back before any `git stash` steps below: 1.5.2 reworked it, so a `git stash pop` of your old edits conflicts with most of it.

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
- Ports 80 and 443 open in your firewall and published by the stack (the default configuration). Let's Encrypt checks your domain by fetching a small file from port 80, now and again at every renewal, so port 80 has to stay reachable
- A terminal in the CozyVTT folder, the one with `docker-compose.yml`, for every command below

### HTTPS is remembered by browsers

CozyVTT's backend sends `Strict-Transport-Security: max-age=31536000; includeSubDomains` with every answer it gives, the API's included. That header (HSTS) tells a browser to use only HTTPS for that name, and for every name under it, for a year (365 days). A browser takes notice of it only when it arrives over HTTPS with a certificate the browser trusts, so it begins to apply the first time someone uses your instance that way: through a trusted certificate of your own, such as one from Let's Encrypt, a Cloudflare Tunnel or any other proxy that adds HTTPS. A self-signed or Let's Encrypt staging certificate, which the browser warns about, does not start it, even if the visitor clicks past the warning.

So decide before you start that this name stays on HTTPS. If you try HTTPS briefly and then go back to plain HTTP on the same name, every browser that loaded the app over HTTPS refuses `http://` for that name, and for any name under it such as `play.vtt.example.com` if you use `vtt.example.com`, for up to a year, until the time runs out or each visitor clears it in their browser. A different name for testing avoids it.

### How it works

Let's Encrypt gives a certificate to whoever can show they control the domain. Certbot, the program that asks for it, shows that by writing a small file into a folder, and Let's Encrypt then fetches that file from `http://your-domain.com/.well-known/acme-challenge/` on port 80. So the nginx container has to serve that folder, and the folder has to be one the container can see. The `nginx/conf.d/` folder is already shared with the container (it appears there as `/etc/nginx/cozyvtt.d/`), so a folder inside it, `nginx/conf.d/acme/`, is shared too.

This is certbot's "webroot" method. It leaves nginx running, which matters at renewal: certbot renews by itself every couple of months, and the other method, `--standalone`, needs port 80 for itself and so fails while nginx holds it.

### Obtain a certificate

1. Install certbot and make the folder it will write into:

   ```bash
   sudo apt-get install -y certbot
   mkdir -p nginx/conf.d/acme
   ```

   `apt-get` prints a long list of what it installs and ends without an error; `mkdir` prints nothing. `ls nginx/conf.d` should now list `acme`.

2. Create `nginx/conf.d/acme.conf`, putting your domain in place of `your-domain.com`. It answers Let's Encrypt's check on port 80 and carries on serving CozyVTT over HTTP as before:

   ```nginx
   # nginx/conf.d/acme.conf: Let's Encrypt's check on port 80.
   # Replaced by https.conf once the certificate is in place.
   server {
       listen 80;
       server_name your-domain.com;

       location /.well-known/acme-challenge/ {
           root /etc/nginx/cozyvtt.d/acme;
       }

       include /etc/nginx/cozyvtt/locations.conf;
   }
   ```

3. Restart nginx and check it started:

   ```bash
   docker compose restart nginx
   docker compose logs --tail 20 nginx
   ```

   The log should end with lines about worker processes starting. If nginx found a mistake in your file, it does not start, and the last line names the file and the line.

4. Ask for the certificate:

   ```bash
   sudo certbot certonly --webroot -w "$PWD/nginx/conf.d/acme" -d your-domain.com
   ```

   The first time, certbot asks for your email address and for you to accept its terms. It should end with `Successfully received certificate` and say that the certificate was saved under `/etc/letsencrypt/live/your-domain.com/`. `$PWD` is the folder you are in, which is why this runs from the CozyVTT folder.

   If it fails instead:

   | Certbot says | Meaning |
   |---|---|
   | `Invalid response from http://your-domain.com/.well-known/acme-challenge/...` with `404` | nginx is not serving the folder. Check that step 2's file is named as shown and that you restarted nginx in step 3 |
   | `Timeout during connect (likely firewall problem)` | Port 80 does not reach this server from the internet. Open it in your firewall and your router |
   | `DNS problem: NXDOMAIN` | The domain does not point at this server yet |

### Configure Nginx to use the certificate

Your HTTPS settings go in a file of your own in the `nginx/conf.d/` folder, which git leaves alone, so `git pull` never stops at them and upgrades never change them. You do not edit `nginx/nginx.conf`.

1. Copy the certs into `nginx/certs/`:
   ```bash
   sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem nginx/certs/server.crt
   sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem nginx/certs/server.key
   sudo chown $(whoami) nginx/certs/*
   ```

   The key stays readable by your account alone (`ls -l nginx/certs` shows `-rw-------` for `server.key`), which is as it should be: nginx reads it as root when it starts, and the nginx container keeps the one power root needs to read a file that belongs to another account. If nginx cannot open the key, it does not start, and `docker compose logs nginx` ends with `cannot load certificate key "/etc/nginx/certs/server.key"` and `Permission denied`.

2. Take away the temporary file from step 2 of "Obtain a certificate", if you made it. `https.conf` below answers Let's Encrypt's check itself, and two files answering for the same domain on port 80 would leave the first one in charge:

   ```bash
   rm -f nginx/conf.d/acme.conf
   ```

3. Create `nginx/conf.d/https.conf` with this content, putting your domain in place of `your-domain.com` on the two `server_name` lines:

   ```nginx
   # nginx/conf.d/https.conf: CozyVTT over HTTPS, with the certificate in nginx/certs/

   # Visitors who type http:// for your domain are sent to https://.
   # Let's Encrypt's HTTP check still reaches its folder, because the redirect
   # is inside "location /" and the check has a location of its own.
   server {
       listen 80;
       server_name your-domain.com;

       location /.well-known/acme-challenge/ {
           root /etc/nginx/cozyvtt.d/acme;
       }

       location / {
           return 301 https://$host$request_uri;
       }
   }

   server {
       listen 443 ssl;
       http2 on;
       server_name your-domain.com;

       ssl_certificate     /etc/nginx/certs/server.crt;
       ssl_certificate_key /etc/nginx/certs/server.key;
       ssl_protocols       TLSv1.2 TLSv1.3;
       ssl_ciphers         HIGH:!aNULL:!MD5;
       ssl_prefer_server_ciphers on;

       # HSTS tells browsers to reach this domain over HTTPS only. The backend
       # already sends a one-year one with every answer from /api (see "HTTPS is
       # remembered by browsers" above), so this line only adds it to the app
       # page and lets you choose the length. Turn it on once HTTPS works,
       # not before, and start with a short max-age (300) before raising it.
       # add_header Strict-Transport-Security "max-age=63072000" always;

       # The same rules as the plain-HTTP server: /api/ and /socket.io/ to
       # the backend, everything else to the frontend.
       include /etc/nginx/cozyvtt/locations.conf;
   }
   ```

   The last line is what sends each request to the right container. It reads CozyVTT's own list of rules, so an upgrade that changes them reaches your HTTPS server as well.

   The first server sends to HTTPS only requests for your domain: a plain-HTTP request by your server's IP address, or under another name that leads to it, is still answered by CozyVTT's own server without HTTPS. To send those to your domain over HTTPS too, write `listen 80 default_server;` in place of `listen 80;`, and `return 301 https://your-domain.com$request_uri;` in place of the `return` line.

4. Restart Nginx and check it started:
   ```bash
   docker compose restart nginx
   docker compose logs --tail 20 nginx
   ```

   The log should end with lines about worker processes starting. If nginx found a mistake in your file, it does not start, and the last line names the file and the line, for example `nginx: [emerg] ... in /etc/nginx/cozyvtt.d/https.conf:12`.

5. Open `https://your-domain.com`. You should see CozyVTT with a padlock in the address bar, and `http://your-domain.com` should send you there. If it does not, `acme.conf` is still in `nginx/conf.d/`: remove it and restart nginx again.

### Keep the certificate renewed

Certbot's package sets up a timer that tries to renew twice a day, and renews a certificate in its last 30 days. Check that it is there:

```bash
systemctl list-timers | grep certbot
```

A line with a time under `NEXT` means it is. Two more things make renewal complete:

1. **Copy the renewed certificate to where nginx reads it, and restart nginx.** Certbot runs every script in `/etc/letsencrypt/renewal-hooks/deploy/` after it renews a certificate. Create one, putting the full path to your CozyVTT folder in place of `/path/to/CozyVTT`:

   ```bash
   sudo tee /etc/letsencrypt/renewal-hooks/deploy/cozyvtt.sh >/dev/null <<'EOF'
   #!/bin/sh
   # Runs after certbot renews a certificate: put it where nginx reads it, then restart nginx.
   set -e
   COZYVTT=/path/to/CozyVTT
   cp "$RENEWED_LINEAGE/fullchain.pem" "$COZYVTT/nginx/certs/server.crt"
   cp "$RENEWED_LINEAGE/privkey.pem" "$COZYVTT/nginx/certs/server.key"
   docker compose -f "$COZYVTT/docker-compose.yml" restart nginx
   EOF
   sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/cozyvtt.sh
   ```

   `RENEWED_LINEAGE` is a value certbot fills in: the folder of the certificate it just renewed.

2. **Test a renewal now, without waiting two months:**

   ```bash
   sudo certbot renew --dry-run
   ```

   Certbot asks Let's Encrypt's test server for a pretend renewal, which makes the same check on port 80. It should end with `Congratulations, all simulated renewals succeeded`, and it changes nothing. It does not run the script above either, so run that once by hand to see that it works:

   ```bash
   sudo RENEWED_LINEAGE=/etc/letsencrypt/live/your-domain.com /etc/letsencrypt/renewal-hooks/deploy/cozyvtt.sh
   docker compose logs --tail 5 nginx
   ```

   When it works, the first command ends with Docker's `Container cozyvtt-nginx  Started` line, and the log shows nginx starting again. If it says `cp: cannot stat` instead, the domain in its path is not the one certbot used: `sudo ls /etc/letsencrypt/live` lists the right one.

If the dry run fails, it names the domain and the reason; the table under "Obtain a certificate" lists the usual ones. One more:

| Certbot says | Meaning |
|---|---|
| `Could not bind TCP port 80` | The certificate was obtained with `--standalone`, the method an earlier version of this guide used, which cannot renew while nginx runs. See the next section |

### If you obtained your certificate with the earlier steps

An earlier version of this guide had you stop nginx and run `certbot certonly --standalone`. That certificate works until it expires, about 90 days after it was issued, and then fails to renew. Run `sudo certbot renew --dry-run` to see whether yours is affected: if it says `Could not bind TCP port 80`, it is. To fix it:

1. Make the folder: `mkdir -p nginx/conf.d/acme`
2. In `nginx/conf.d/https.conf`, make the port-80 server's check location read `root /etc/nginx/cozyvtt.d/acme;` (it may say `root /var/www/certbot;`), or add the location as shown above if it has none. Then restart nginx: `docker compose restart nginx`
3. Run the command from step 4 of "Obtain a certificate" again with `--force-renewal` added. It replaces the certificate and changes how certbot renews it from now on
4. Copy the new certificate with the commands in step 1 of "Configure Nginx to use the certificate", restart nginx, and set up the script and the dry run under "Keep the certificate renewed"
5. If you added the weekly `cron` line from the earlier steps, remove it with `crontab -e`: the script does its job

---

## Manual Deployment

If you prefer to manage the processes yourself (systemd, pm2, etc.) without Docker:

### 1. Install Node.js 26

```bash
curl -fsSL https://deb.nodesource.com/setup_26.x | sudo -E bash -
sudo apt-get install -y nodejs
```

Check that it worked:

```bash
node --version
```

If it worked, this prints `v26` followed by the rest of the version number, for example `v26.11.1`.

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
# Edit .env: set DATABASE_URL, SESSION_SECRET (openssl rand -hex 32) and
# NODE_ENV=production, and put your site's address, such as
# https://your-domain.com, in CORS_ORIGIN and APP_URL (email links use APP_URL)
npm install
npx prisma migrate deploy
npm run build   # also prepares the database client (prisma generate)

# Frontend. The page asks its own address for the API, which your Nginx sends
# to the backend. The build still reads two old settings that would point the
# page at a backend on another address, so they are set empty here, in case an
# old frontend/.env sets them.
cd ../frontend
npm install
VITE_API_URL="" VITE_SOCKET_URL="" npm run build
# Output: frontend/dist/
```

If your database runs on another server and asks for an encrypted connection, add the setting to the end of `DATABASE_URL`, such as `postgresql://cozyvtt:your-db-password@db.example.com:5432/cozyvtt?sslmode=verify-full`. The backend reads these settings with the `pg` driver for every connection it makes. That driver checks the database's certificate for `sslmode=require` too, so a database whose certificate it cannot check is refused (`self-signed certificate` in the backend's log): name the certificate authority's file as well, such as `?sslmode=verify-full&sslrootcert=/path/to/ca.crt`. Leave out `sslmode=no-verify`, which the driver also offers: the Admin Dashboard's **Create Backup** and restore give the same address to `pg_dump` and `psql`, which refuse that value (`invalid sslmode value`), so every backup and restore fails.

### 4. Run the backend with pm2

Step 3 ended in the `frontend` folder, so this goes back to `backend` first. pm2 is installed for every account on the machine, which is why it needs `sudo`:

```bash
sudo npm install -g pm2
cd ../backend
pm2 start dist/server.js --name cozyvtt-backend
pm2 save
pm2 startup  # Follow the printed instructions to enable autostart
```

`pm2 status` should then list `cozyvtt-backend` as `online`. If it says `errored`, or the restart count under `↺` keeps rising, `pm2 logs cozyvtt-backend` shows why; a line containing `[FATAL]` names the setting in `backend/.env` to fix.

### 5. Serve with Nginx

Create `/etc/nginx/sites-available/cozyvtt`:

```nginx
# The live table's address for the page's security policy below: this
# server's own name, written only when the browser sent a well-formed one.
map $host $csp_socket_sources {
    ~^(\[[0-9a-f:.]+\]|[a-z0-9.-]+)$  "ws://$host:* wss://$host:*";
    default                            "";
}

server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    # nginx 1.25.1 and later prefer "listen 443 ssl;" with "http2 on;" on the
    # next line; this form works on older versions too.
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate     /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    # Headers for everything nginx answers except the app page, which sets its
    # own full set in "location /" below.
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;

    # Must be >= the largest MAX_*_SIZE_MB in .env, plus a few MB of overhead
    client_max_body_size 55M;

    # Compress text on the way out: the app's scripts and styles, and the
    # backend's JSON, shrink to about a third. Leave the version out of answers.
    gzip            on;
    gzip_comp_level 5;
    gzip_min_length 1024;
    gzip_vary       on;
    gzip_types      application/json text/css application/javascript image/svg+xml text/plain;
    server_tokens   off;

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
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
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
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
    }

    # Frontend static files (SPA)
    location / {
        root  /path/to/cozyvtt/frontend/dist;
        index index.html;
        # A folder in the build, such as assets/, is also the address of an app
        # page (/assets is the Asset Library), so a path that names a folder
        # serves the app too; without this line, reloading that page gives
        # "403 Forbidden".
        if (-d $request_filename) {
            rewrite ^ /index.html last;
        }
        try_files $uri /index.html;

        # The app page's own security headers: the same ones the Docker setup
        # sends from frontend/security-headers.conf. HSTS is repeated here
        # because a location that sets any header of its own loses the ones
        # set in the server block above.
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
        add_header Content-Security-Policy "default-src 'self'; script-src 'self'; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' $csp_socket_sources; media-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" always;
        add_header X-Frame-Options "DENY" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
        add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=()" always;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/cozyvtt /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

`sudo nginx -t` should print `syntax is ok` and `test is successful`.

**The security headers in `location /` matter.** The Docker setup sends them from the frontend container, which a manual install does not have, so without them the app page has no Content-Security-Policy: nothing stops a script injected through some other flaw from running. They go on the page only, because the backend sets its own on `/api`, and a `frame-ancestors 'none'` on the PDFs it serves would stop the document reader from showing them. nginx drops the server block's headers from any location that sets one of its own, so a location you add yourself (to cache pictures, say) needs the same lines repeated in it. Check that they arrive:

```bash
curl -sI https://your-domain.com/ | grep -i -e content-security -e permissions-policy -e x-frame
```

It should print three lines. These lines are a copy of `frontend/security-headers.conf`, so after an upgrade compare them with that file.

**Backups need PostgreSQL's command-line tools.** The Admin Dashboard's **Create Backup** and restore run `pg_dump` and `psql` on the machine the backend runs on. The `postgresql-15` package from step 2 brings them; `pg_dump --version` should print 15 or higher. If it says command not found, install `postgresql-client-15` from the same repository.

---

## Environment Configuration

### Generating Secrets

```bash
# Generates a SESSION_SECRET. Run once and paste into .env.
openssl rand -hex 32
```

### Setup token (optional)

`SETUP_TOKEN` is the token the setup wizard asks for on a fresh install. It is optional: left unset, the backend makes one at start and prints it in its log (see [Complete the setup wizard](#4-complete-the-setup-wizard)). Set it only if you want to choose the value yourself, for example in an automated install. Once setup has run it is never read again, so you can remove it from `.env`.

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

Email counts as set up only when `SMTP_HOST`, `SMTP_USER` and `SMTP_PASS` are **all** set. A mail server that needs no login, such as a relay on your own network, is not supported: leave the user or password empty and the **Settings** tab of the Admin Panel says **Not configured** and names the three settings, there is no **Send Test Email** button, and password-reset and invitation emails stay off, whatever else you set. `SMTP_PORT` defaults to 587 and `SMTP_SECURE` to `false`.

Test it after deploying with **Send Test Email** on the **Settings** tab of the Admin Panel.

#### What SMTP unlocks

| Feature | With SMTP | Without SMTP |
|---|---|---|
| **Adding a user** | **Invite User** — they get an email with a link and choose their own password. Nobody else ever sees it. | **Create User** — a temporary password is generated and shown to you once, to hand over yourself |
| Password resets (self-service) | User clicks **Forgot password?** on the sign-in page and gets a reset link | Unavailable — the user has to ask an admin |
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

**Universal VTT imports need more room than the map limit.** A `.uvtt` file carries its picture as text, which is about a third (4/3) bigger than the picture itself. CozyVTT accepts a `.uvtt` file of up to the map limit times 4/3, plus 8 MB for the walls and lights (about 75 MB with the default `MAX_MAP_SIZE_MB=50`), and answers a larger one with a message saying so. With the default `NGINX_MAX_BODY_SIZE=55M`, the proxy refuses any `.uvtt` file over 55 MB with a 413, which means a picture larger than about 40 MB, although a plain map upload of up to 50 MB works. To let through every file CozyVTT accepts, multiply `MAX_MAP_SIZE_MB` by 4/3 and add 10: that covers the 8 MB for walls and lights and leaves a little over for the way the browser wraps the upload. With the default map limit, set `NGINX_MAX_BODY_SIZE=76M`. Whatever the limit, each import waits at most 20 seconds for its turn behind other DMs' imports and has 30 seconds to finish once it starts, so that one slow import cannot hold up every other DM's. Past either limit nothing is saved, and the DM's Map Library shows "Another map import is running on the server. Try again in a minute." or "This map import took longer than 30 seconds and was stopped, so nothing was saved. Try again in a minute." That answer comes at most 50 seconds after the upload has reached the backend, within the 60 seconds the bundled nginx waits for it. A proxy of your own must wait at least that long, or the DM sees only "Failed to import UVTT file."

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

Uploading pictures, sound and documents, and importing Universal VTT maps, are not counted here. They have their own limit of 30 a minute per user, set with `ASSET_UPLOAD_RATE_LIMIT` in the same way. A value that is not a whole number above zero is ignored there too, with a warning in the backend log.

### Other settings

The rest of what the backend reads from its environment. Every one is optional; leave it out and the default applies. On Docker, set the ones marked **Yes** in `.env` and apply them with `docker compose up -d`. The ones marked **No** are not passed to the backend container, so setting them in `.env` does nothing there; they are for an install without Docker (`backend/.env`).

| Setting | Default | What it does | Docker |
|---|---|---|---|
| `SESSION_MAX_AGE` | `3600000` (1 hour) | How long a sign-in lasts without a request, in milliseconds | Yes |
| `REMEMBER_ME_MAX_AGE` | `2592000000` (30 days) | How long a **Remember me** sign-in lasts, and the longest any sign-in lasts, in milliseconds. A game tab left open is disconnected within a minute of that limit | Yes |
| `RATE_LIMIT_MAX_REQUESTS` | `300` | Requests per minute to `/api` from one address | Yes |
| `ASSET_UPLOAD_RATE_LIMIT` | `30` | Uploads per minute per user | Yes |
| `LOG_LEVEL` | `info` (`debug` in development) | How much the backend logs: `debug`, `info`, `warn` or `error` | Yes |
| `PORT` | `4000` | The port the backend listens on | No: the compose file sets 4000 |
| `NODE_ENV` | none, which runs the backend as `development` | Set it to `production` on a real instance. Anything else accepts a weak `SESSION_SECRET` with only a warning and writes no files to `backend/logs/` | No: the compose file sets `production` |
| `UPLOAD_DIR` | `uploads` | Where uploaded files are stored, relative to the backend folder | No: change the uploads volume in `docker-compose.override.yml` instead; [Database Backups](#database-backups) shows how that file works |
| `BACKUP_DIR` | `backups` | Where the Admin Dashboard writes backups (see [File Storage](#file-storage)) | No: change the backups volume instead |
| `INSTANCE_NAME` | none | The name emails use while the **Instance Name** in **Admin → Settings** is empty or still CozyVTT | No |
| `FRONTEND_URL` | none | An older name for `APP_URL`, read only when `APP_URL` is not set | No: the compose file always sets `APP_URL` |

The instance's name is not an environment setting: set it in the setup wizard or in **Admin → Settings → Instance Name**. It is the browser tab's title and is used in every email the instance sends.

`VITE_ALLOWED_HOSTS` in `.env.example` is for the development stack only ([DEVELOPMENT.md](DEVELOPMENT.md)); the production stack does not read it.

---

## File Storage

Uploaded files are stored at `backend/uploads/`. In the Docker setup this directory is bind-mounted from the host, so files survive container restarts and image rebuilds.

Back up `backend/uploads/` alongside your database dumps. See [Database Backups](#database-backups) below.

**Watch the disk the uploads are on.** CozyVTT does not limit how much one account can upload in total (there is no per-user storage quota yet; it is planned as an admin setting). What stops a runaway account is the upload rate limit, and what tells you the disk is filling is the Admin Panel: its **System Overview** shows how much space is free on the disk that holds `backend/uploads/`, and once that disk is more than 80% full it shows a red warning saying so. A full disk makes uploads fail, and on most installs the backups and the database are on the same disk and stop working too. To check by hand, run:

```bash
df -h backend/uploads
```

The `Use%` column is the same number the dashboard shows. If it is high, delete files nobody needs from the **Assets** tab (including **Leftover Files**), delete old backups from **Backups**, or move `backend/uploads/` to a larger disk.

A file can be left in `backend/uploads/` with no asset naming it, for example when a restored backup brings back files its database does not know. The **Assets** tab of the Admin Panel lists these under **Leftover Files** and can delete them after asking; see [Files with no owner, and leftover files](USER_GUIDE.md#files-with-no-owner-and-leftover-files-admins) in the user guide.

Instance backups made from the Admin Dashboard are written to `backend/backups/`, **not** inside `uploads/`: a backup holds every credential on the instance, while `uploads/` is media you may sync anywhere. Versions before 1.5.0 wrote them to `backend/uploads/backups/`; if you have backups there, move them to `backend/backups/`, which is the only directory the dashboard lists now. Both folders belong to the container's user, so on Docker the move needs `sudo`, run through `sh -c` so that the `*` is read by an account that can see into the folder, and the `chmod` makes the moved backups readable by that user alone, as new ones are:

```bash
sudo sh -c 'mv backend/uploads/backups/*.zip backend/backups/ && chmod 600 backend/backups/*.zip'
```

Without Docker, `backend/backups/` appears the first time the Backups tab is opened; to move them before that, create it with `mkdir -p backend/backups && chmod 700 backend/backups`, then run the part in quotes on its own, without `sudo sh -c`.

On an install without Docker the backend writes them to a `backups` folder in its working directory (`backend/backups`, beside `uploads`); set the `BACKUP_DIR` environment variable to put them somewhere else. A folder inside the uploads directory is refused, and the backend will not start with one. The Docker setup keeps them at `backend/backups/` on the host and does not pass `BACKUP_DIR` through.

Because a backup holds every credential on the instance, the backend keeps the folder and each file in it readable by its own user alone (the folder is mode `700`, each backup `600`), and `backup.sh` does the same for its folder and the dumps in it, including any an earlier version left readable. While a backup or a restore runs, the working copy of the database it keeps in the system's temporary folder (`/tmp` unless `TMPDIR` says otherwise) sits in a folder of its own with the same protection, and is removed when it finishes, whether it worked or not. On a Docker host that user is the container's `appuser`, so copying a backup off the machine by hand needs `sudo`; downloading it from the dashboard needs nothing. The database password is never on a tool's command line either: `pg_dump` and `psql` read it from their environment, where the process list cannot show it.

If the backend is stopped part-way through a backup or a restore (killed, or the machine loses power), its temporary folder (`cozyvtt-db-…` or `cozyvtt-restore-…`) is left behind. On Docker, the backend's `/tmp` is a volume of its own, `backend_tmp`, which outlives the container, and the backend removes such a folder each time it starts, for example with `docker compose restart backend`. On a manual install it stays until you delete it.

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

**Backups are never deleted automatically.** Every backup made with **Create Backup**, and the database-only backup each restore makes first, stays in the folder until you delete it with the bin. A backup holds every uploaded file, so each one is about as large as `backend/uploads/`, and the folder grows with every backup: delete the ones you no longer need, or download them for safekeeping and then delete them. Watch the disk space with `df -h backend/backups`. (The 30-day pruning of the backup script below applies only to the script's own `cozyvtt_*.sql.gz` files.)

A backup keeps the instance as it was when it was made. An account deleted since is still in it, with its email address, characters and files, and restoring that backup brings the account back; the admins' activity log is in it too, and it keeps every line for as long as the instance exists (see [The activity log](USER_GUIDE.md#the-activity-log-admins)). Delete old backups you no longer need if that matters to you.

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

Before anything is touched, the file is checked: its name must end in `.zip`, it must be a ZIP archive of at most 4 GB that unpacks to at most 10 GiB in at most 100,000 files, and its database must be a complete `pg_dump` of a CozyVTT database, holding nothing but SQL. A file that fails any of these is refused with the reason on screen, and nothing has changed. Only one restore runs at a time: while one is running, a second restore, and **Create Backup**, are refused until it has finished. A backup of the database as it is at that moment is then written to the backup list (database only, named like any other backup), so restoring the wrong file can be undone by restoring that one; the restore names it when it finishes. The database is loaded in a single step that is undone as a whole if any part of it fails, so a backup that cannot be applied leaves your existing data untouched, and the reason is in the backend log:

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

**A restore signs everyone out.** Backups made from now on leave the login sessions out, and a restore empties whatever sessions an older backup carried, so a sign-in that was ended after the backup was made (a password change, a removed account) cannot come back with it. Every open game connection is dropped just before the database is replaced, and until the restore has finished nobody can reconnect and every page's requests are answered "The instance is being restored from a backup. Try again in a minute": a change someone made during the load would otherwise be written over the restored data. Everyone signs in again afterwards. Stopping play before you restore spares your players the interruption.

If the backend is stopped while a restore is running, the uploaded backup it was working from is left in the backups folder as `restore-temp-….zip`; it is deleted the next time the backend starts.

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

Write the address exactly as the backend's `.env` has it. A password holding a character an address cannot carry as it is, such as `/`, `#`, `?` or `%`, is written percent-encoded there (`%2F` for `/`, `%25` for `%`), and the scripts decode it as the backend does. Leave out `:5432` and port 5432 is used.

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

The `umask 077` in brackets makes the file readable by you alone, as the script's are: it holds every password hash and MFA secret on the instance. (Password reset and invitation links are stored hashed, so a backup holds no working link.)

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
{"err":{"cause":{"message":"Connection terminated unexpectedly","name":"Error","stack":"Error: Connection terminated unexpectedly\n    at ..."},"clientVersion":"7.10.0","message":"Connection terminated due to connection timeout","name":"Error","stack":"Error: Connection terminated due to connection timeout\n    at ..."},"level":"error","message":"Error checking setup status","timestamp":"2026-10-15T06:16:47.132Z"}
```

To see the most recent errors:

```bash
tail -n 20 backend/logs/error.log
```

An error the backend has no way to recover from is written here too, as a line ending in `; stopping` (`Uncaught exception; stopping` or `Unhandled promise rejection; stopping`). The backend then exits, and Docker starts it again. If you see one, the line's stack trace is what to attach to a bug report. The log files are closed as the backend exits, so a further error in the second it takes to stop appears only in `docker compose logs backend`, as `Uncaught exception while stopping` or `Unhandled promise rejection while stopping`.

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
docker compose exec -u appuser backend wget -qO- http://localhost:4000/health
```

Docker already runs this check for you every 30 seconds; `docker compose ps` shows the backend as `healthy` or `unhealthy` based on it.

The **Status** card on the Admin Panel's dashboard shows three lights and a count of the live connections open at that moment:

| Light | Green when | What it does not tell you |
|---|---|---|
| **API** | The card's request reached the backend | |
| **DB** | The database answers a simple query, as in the check above | |
| **WS** | The backend's live-connection service (Socket.io) is running inside the backend. That is so whenever the backend itself is up, so it is practically always green | It does not tell you that a proxy in front lets live connections through. A proxy that refuses WebSocket connections leaves it green while dice, chat and token movement fail |

The card says **Healthy** when all three are green, **Degraded** with the failing part in red when **DB** or **WS** is not, and **Unknown** when the backend could not be asked at all. To see whether live connections really work, open a campaign: the right of its header shows **Connected** (on a narrow screen only an icon), and a table that stays on **Connecting...**, **Disconnected** or **Connection Error** has the problem described under [Live features don't work](#live-features-dont-work-dice-token-movement-chat).

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

### The wizard says "Setup token is missing or wrong"

The token the wizard asks for is printed in the backend log each time the backend starts while setup is not complete, and again each time the wizard is refused for lacking it. Run `docker compose logs backend | grep "setup token"` and copy the code from the **last** such line: an earlier start printed a different one. If `.env` sets `SETUP_TOKEN`, enter exactly that value instead; the log then only says to use it and does not print it.

### Setup fails with "An error occurred during setup" (502)

Same root cause as above: the browser reached the wizard (served by the frontend), but the request that creates your admin account goes to the backend, which your proxy can't reach. Run the same check.

If you removed the bundled `nginx` service, the usual culprit is a missing `ports` entry on the **backend** service — it is `expose`-only by default, which means "reachable from other containers" but not from your proxy.

### The backend keeps restarting, and its log says `[FATAL]`

`docker compose ps` shows the backend as `Restarting`, and nobody can sign in. A production instance refuses to start on a secret anyone could guess. Find the reason:

```bash
docker compose logs backend | grep FATAL
```

| The line says | What to do |
|---|---|
| `SESSION_SECRET is shorter than 32 characters`, `SESSION_SECRET is a placeholder value` or `SESSION_SECRET is not set` | Run `openssl rand -hex 32`, put what it prints in `.env` after `SESSION_SECRET=`, and run `docker compose up -d`. Everyone is signed out once |
| `DATABASE_URL uses the placeholder password from .env.example` | Follow [Changing the database password](#changing-the-database-password). The database keeps the password it was made with, so it has to be changed inside the database first |

Use `docker compose up -d`, which reads `.env` again; `docker compose restart` keeps the old value. Once the backend starts, `docker compose ps` shows it as `healthy` within a minute.

### A container stops with "Permission denied", "Operation not permitted" or "Read-only file system"

Each container gets only the Linux capabilities its start-up needs, and some have read-only files (see [Build and start the stack](#3-build-and-start-the-stack)). Something that needs one of the other capabilities, or writes where nothing may be written, fails, and the container's log says so. Find the line:

```bash
docker compose logs --tail 30 backend nginx
```

| Where it happens | What to do |
|---|---|
| A command you ran with `docker compose exec backend ...` | Run it as the backend's user: `docker compose exec -u appuser backend ...` |
| `docker-compose.override.yml` adds a program or a setting that needs a capability, such as a network tool or a mount of a different kind | Give that one back in your override file, under the same service: `cap_add:` followed by `- NET_ADMIN` (for example), one per line, indented like the other settings |
| A command you ran in the backend container writes a file, and stops with `Read-only file system` | Have it write under `/tmp`, the one folder there that may be written besides uploads, backups and logs, and copy the file out with `docker compose cp backend:/tmp/the-file .` |
| A file of yours in `nginx/conf.d` writes a log to a file, such as `access_log /var/log/nginx/mysite.log;`, and nginx stops with `Read-only file system` | Send it to nginx's own log instead, `access_log /dev/stdout;`, which `docker compose logs nginx` shows, or mount a folder of your own for it in `docker-compose.override.yml` |
| nginx cannot read your certificate or key in `nginx/certs` | Check the files are there and not empty with `ls -l nginx/certs`, then copy them again with the steps in [Configure Nginx to use the certificate](#configure-nginx-to-use-the-certificate) |

`docker compose up -d` applies a change to the override file; the container is recreated, and `docker compose ps` shows it running again.

Three lines like these appear each time the stack starts and are harmless: the database tries to set the permissions of its folders, which already have the right ones, and the frontend's image tries to make it listen on IPv6 as well, which nothing needs: the bundled nginx reaches it over Docker's own network.

```
cozyvtt-database  | chmod: /var/lib/postgresql/data: Operation not permitted
cozyvtt-database  | chmod: /var/run/postgresql: Operation not permitted
cozyvtt-frontend  | 10-listen-on-ipv6-by-default.sh: info: can not modify /etc/nginx/conf.d/default.conf (read-only file system?)
```

If the container keeps running and `docker compose ps` shows the database as `healthy`, there is nothing to fix.

### The site answers 502 after `docker compose up -d` recreated the backend

The bundled nginx looks the backend and frontend up again within ten seconds of either being recreated, so this clears by itself. If it does not, your `nginx/nginx.conf` is an older or edited copy that still names `http://backend:4000` in its `proxy_pass` lines: when `docker compose up -d` recreates only the backend (after you change `.env`, for example), nginx keeps using the old container's address, and everything sent to the backend answers **502 Bad Gateway**. The pages load, but signing in fails, while `docker compose ps` shows the backend as `healthy`. Restart nginx so it finds the new one:

```bash
docker compose restart nginx
```

It ends by printing `Container cozyvtt-nginx  Started`, and the site answers normally again. To stop it happening, put the shipped `nginx/nginx.conf` back and move your changes out of it, with the steps in the 1.5.2 upgrade notes in `CHANGELOG.md`: keep a copy of your changes, `git checkout nginx/nginx.conf`, pull, then put HTTPS in `nginx/conf.d/` and a proxy's addresses in `.env`. The `git stash` steps for `docker-compose.yml` do not suit this file: 1.5.2 reworked it, so a `git stash pop` of your old edits conflicts with most of it.

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

Read the new version's **Upgrading** notes at the top of `CHANGELOG.md` first, on GitHub before you pull or in your CozyVTT folder straight after. They say whether that release needs anything from you. If you are more than one release behind, read the notes of every release you skipped, oldest first: the commands below stay the same, and the database migrations of every release in between run in order on the first start. 1.5.2 does if a Cloudflare Tunnel or another proxy sits in front of CozyVTT: it needs `NGINX_TRUSTED_PROXIES` in `.env`, as [Visitor addresses and sign-in limits](#visitor-addresses-and-sign-in-limits) explains, or every visitor counts as the proxy's one address. Then:

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

**None of 1.4.0, 1.5.0, 1.5.1, 1.5.2 and 1.5.3 needs a manual step here**: their database migrations run automatically, and 1.5.1 and 1.5.2 have none. Only one of them changes existing data: 1.5.3 clears the author of any custom creature whose account had already been deleted, and keeps the creature. (1.5.0 has four things to know after the upgrade, all in the changelog's upgrade note: backups now live in `backend/backups/`, MFA backup codes must be regenerated, a production instance refuses to start while `DATABASE_PASSWORD` is still the placeholder, and an install without Docker needs the database role to own the database before a backup can be restored.) This section applies only if you have characters created on a version **before 1.3.0** and never ran it.

Characters made from the built-in templates of those versions keep some of their content in fields the sheet no longer reads: a Pathfinder 2e character's strikes and class features, and a D&D 5e character's languages, personality traits, ideals, bonds, flaws and allies. Saving a character moves its own content to the right place. Until a character is saved or moved, though, a Pathfinder 2e sheet shows no strikes or class features. Run this once to move every character at once:

```bash
# See what would change, without writing anything
docker compose exec -u appuser backend node dist/scripts/migrate-sheet-fields.js --dry-run

# Apply
docker compose exec -u appuser backend node dist/scripts/migrate-sheet-fields.js
```

Without Docker, run the same two commands from the `backend` folder, without `docker compose exec -u appuser backend`. (`npm run migrate:sheet-fields` works only in a development checkout; the production image does not include the tool it needs.)

What to expect:

- The dry run prints how many characters it looked at, then each character it would change, with its name, game system and id, and a line for each change, for example `moved 2 attack(s) to strikes`.
- Nothing is deleted that has not been moved. Where a character already has its own text, the older text is added after it, and where there is no room for it, for example a second player name, the old field is left as it is and the character is listed under "keep something in an older field" so you can look at it.
- You do not need to stop the stack. A player who saves, or a DM who changes hit points, while it runs keeps that change.
- If it prints an error, or says a character changed while being written, it ends with an error status; run it again. Running it twice is harmless.

Details in
[backend/DATABASE_MIGRATIONS.md](../backend/DATABASE_MIGRATIONS.md).

### Without Docker

Coming from 1.5.1 or earlier, install Node.js 26 first, as in [Install Node.js 26](#1-install-nodejs-26): CozyVTT is built and tested on Node.js 26 only. Check that `node --version` prints a version starting `v26`, then update:

```bash
git pull origin main

cd backend
npm install
npx prisma migrate deploy
npm run build   # also prepares the database client (prisma generate)
pm2 restart cozyvtt-backend

cd ../frontend
npm install
# Empty, as in the install steps, in case an old frontend/.env sets them
VITE_API_URL="" VITE_SOCKET_URL="" npm run build
# Static files in frontend/dist/ are now updated — Nginx serves them immediately
```

Coming from 1.5.1 or earlier, also bring your Nginx site file, `/etc/nginx/sites-available/cozyvtt`, up to date with the example in [Serve with Nginx](#5-serve-with-nginx). Copy these lines from the example into the same places in your file:

1. In the `server` block for port 443: the five `gzip` lines and `server_tokens off;`.
2. In `location /`: the `if (-d $request_filename)` block, `try_files $uri /index.html;` in place of your `try_files` line, and the six `add_header` lines below it.
3. In `location /socket.io/`: the `X-Forwarded-For` and `X-Forwarded-Proto` lines.
4. In `location = /health`: the `X-Real-IP`, `X-Forwarded-For` and `X-Forwarded-Proto` lines.

Without them the app page has no Content-Security-Policy, the app and the backend's answers are not compressed, and reloading or bookmarking the Asset Library page (`/assets`) shows "403 Forbidden". Then check and apply the file:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

`sudo nginx -t` should print `syntax is ok` and `test is successful`, and the `curl` check under [Serve with Nginx](#5-serve-with-nginx) should print three lines.

Coming from 1.4.0 or earlier, also make the database role the owner of the database and its `public` schema once, so a backup can be restored (see [Database Backups](#database-backups)); use your own names if you changed them:

```bash
sudo -u postgres psql -c "ALTER DATABASE cozyvtt OWNER TO cozyvtt;"
sudo -u postgres psql -d cozyvtt -c "ALTER SCHEMA public OWNER TO cozyvtt;"
```

---

## Hardening Checklist

Before going live:

- [ ] **Strong secret** — `SESSION_SECRET` is a 32+ character random string, not the placeholder value from `.env.example`. A production instance refuses to start on a placeholder or on anything shorter than 32 characters
- [ ] **Real database password** — `DATABASE_PASSWORD` is not the placeholder from `.env.example`. A production instance refuses to start on it, the same way it does for `SESSION_SECRET`
- [ ] **HTTPS only** — SSL certificate installed, and your `nginx/conf.d/https.conf` sends plain-HTTP visitors to HTTPS (see [SSL/TLS with Let's Encrypt](#ssltls-with-lets-encrypt)), or a Cloudflare Tunnel provides HTTPS. With Let's Encrypt, `sudo certbot renew --dry-run` ends with `all simulated renewals succeeded`: a certificate that cannot renew expires after about 90 days
- [ ] **Firewall** — Only ports 80 and 443 (or your configured `HTTP_PORT`/`HTTPS_PORT`) are publicly reachable; backend (4000) and database (5432) are not exposed to the internet
- [ ] **Proxies listed** — If a tunnel or proxy passes visitors to the bundled nginx, `NGINX_TRUSTED_PROXIES` in `.env` lists it, and `docker compose logs --tail 5 nginx` shows visitors' own addresses (see [Visitor addresses and sign-in limits](#visitor-addresses-and-sign-in-limits)). With a tunnel on the same server, `HTTP_PORT` and `HTTPS_PORT` start with `127.0.0.1:`
- [ ] **CORS_ORIGIN** — Set to your specific domain, not a wildcard
- [ ] **Setup finished** — The setup wizard has been completed, so `curl -s https://your-domain.com/api/setup/status` prints `"setupCompleted":true`. Until then the wizard, protected by the setup token, is the only thing the instance offers
- [ ] **Registration** — **Enable Public Registration** is **off** for private instances. You choose this in the setup wizard, and can change it later with **Allow Public Registration** in **Admin → Settings**
- [ ] **Admin MFA** — Every administrator account has two-factor authentication on. CozyVTT requires it: an administrator without it sees a banner for 7 days, then can only set it up, change their password or sign out
- [ ] **Backups tested** — Automated backups configured and a restore drill completed successfully
- [ ] **Upload isolation** — `backend/uploads/` is served only through authenticated backend endpoints, not directly by the web server
- [ ] **Security headers** — CozyVTT sends its own (Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy) from the container that serves the app page, so they arrive whether you use the bundled Nginx or your own proxy. A manual install has no such container: its Nginx example in [Manual Deployment](#manual-deployment) sets them in `location /`. Confirm with `curl -sI https://your-host/ | grep -i content-security`. If your proxy strips or overwrites response headers, stop doing that. **HSTS**: the backend already sends `Strict-Transport-Security: max-age=31536000; includeSubDomains` with every answer from `/api`, so a browser that has used the instance over HTTPS keeps that name on HTTPS for a year (see [HTTPS is remembered by browsers](#https-is-remembered-by-browsers)). The app page itself carries it only if you turn on the commented line in the `nginx/conf.d/https.conf` example
- [ ] **Database isolation** — PostgreSQL container uses `expose` (not `ports`); unreachable from outside the Docker network
- [ ] **Log size** — Nothing to set up: the backend rotates `backend/logs/` itself and Docker caps each container's log (see [Monitoring and Logs](#monitoring-and-logs)). Remove any `logrotate` rule you added for `backend/logs/`
- [ ] **OS updates** — A plan exists for keeping the host OS and Docker up to date
- [ ] **Brute-force protection** — `fail2ban` (or equivalent) is configured to block IPs hammering `/api/auth/login` and SSH; CozyVTT's own limits are 5 failed sign-ins per 15 minutes per visitor address and 10 per hour per account from everywhere (each lock is noted in **Admin → Activity**), but a host-level ban catches scanners earlier
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
   `tunnel create` prints the path of the file it wrote, after `Tunnel credentials written to`, and the tunnel's id. Step 5 needs both.
5. Create `~/.cloudflared/config.yml`, with the id and the path from step 4:
   ```yaml
   tunnel: <tunnel-id-from-step-4>
   credentials-file: /home/you/.cloudflared/<tunnel-id>.json

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
8. Tell nginx to believe the tunnel, and keep nginx's ports to this server. Add these three lines to `.env`:
   ```env
   NGINX_TRUSTED_PROXIES=172.16.0.0/12
   HTTP_PORT=127.0.0.1:80
   HTTPS_PORT=127.0.0.1:443
   ```
   then run `docker compose up -d`. `172.16.0.0/12` is the range on most servers; [check yours](#the-range-for-a-proxy-on-the-same-server). Without the first line, every visitor is counted as the tunnel's one address, so a few wrong passwords from anyone lock everybody out of signing in, and everyone shares one limit of 300 requests a minute, which a table opening a map together can reach. Without the other two, a visitor reaching your server over IPv6 could choose the address CozyVTT counts them as. [Visitor addresses and sign-in limits](#visitor-addresses-and-sign-in-limits) explains both.
9. Confirm CozyVTT sees each visitor's own address and not the tunnel's, with the check in [Visitor addresses and sign-in limits](#visitor-addresses-and-sign-in-limits).

Once running, ports 80 and 443 are open to the server itself and nothing else, so only SSH (port 22, or your chosen alternative) needs to be reachable from the internet, and even that you can put behind Cloudflare Access if you want.

A tunnel makes browsers see HTTPS, so the backend's HSTS header starts to apply to your name: plan to keep it on HTTPS (see [HTTPS is remembered by browsers](#https-is-remembered-by-browsers)).

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
- rate limits: 5 failed sign-ins per 15 minutes and 10 new accounts per hour from one address, 300 requests a minute from one address, 30 uploads a minute per user, 20 campaign imports, 20 import previews and 20 campaign exports an hour per user, one at a time, 20 campaign invitation emails an hour per DM, and a limit per account on every kind of event sent to the live table (chat, dice, token moves, the DM's controls), set far above what a game sends
- uploads checked by what the file contains, not by its name or the type it claims
- Argon2id password hashing and a strong `SESSION_SECRET`
- security headers on every response: from helmet on the API, and from the bundled nginx on the app page
