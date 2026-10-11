# Your own nginx settings

Every file in this folder whose name ends in `.conf` is read by the bundled
nginx, after CozyVTT's own configuration. git ignores everything here except
this README, so a `git pull` never stops at your files and never changes them.

Put here what is particular to your server, such as **HTTPS**. Do not edit
`nginx/nginx.conf` or `nginx/locations.conf`: those belong to CozyVTT and
change with upgrades.

- **HTTPS with your own certificate:** copy the complete
  `nginx/conf.d/https.conf` from "SSL/TLS with Let's Encrypt" in
  [docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md#ssltls-with-lets-encrypt). It
  sends the same paths to the backend and the frontend as the plain-HTTP
  server, by including `/etc/nginx/cozyvtt/locations.conf`, so upgrades reach
  it too.
- **A proxy in front of nginx**, such as a Cloudflare Tunnel, needs no file
  here: it is one line in `.env`, `NGINX_TRUSTED_PROXIES`. See "Visitor
  addresses and sign-in limits" in the same guide.

After adding or changing a file, run:

```bash
docker compose restart nginx
docker compose logs --tail 20 nginx
```

If nginx does not like a file, it does not start, and the last lines of the
log name the file and the line.
