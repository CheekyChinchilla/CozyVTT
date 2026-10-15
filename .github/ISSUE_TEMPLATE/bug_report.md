---
name: Bug report
about: Create a report to help us improve
title: ''
labels: ''
assignees: ''

---

> **A security problem?** Do not report it here, because this page is public. Follow [SECURITY.md](https://github.com/CheekyChinchilla/CozyVTT/blob/main/SECURITY.md) instead.
>
> **Remove secrets before you paste anything.** Never post the contents of your `.env`, your `SESSION_SECRET` or `DATABASE_PASSWORD`, a backup file or a session cookie. CozyVTT shortens email addresses in its logs, but nothing else is removed from them or from screenshots.

**Describe the bug**
A clear and concise description of what the bug is.

**To Reproduce**
Steps to reproduce the behavior:
1. Go to '...'
2. Click on '....'
3. Scroll down to '....'
4. See error

**Expected behavior**
A clear and concise description of what you expected to happen.

**Screenshots and console output**
If applicable, add screenshots to help explain your problem. For an error on a page, add what the browser's console shows (press F12). For a server problem, add the last lines of `docker compose logs backend`.

**Your CozyVTT**
 - CozyVTT version: [run `git describe --tags --always` in your CozyVTT folder, or give the newest version at the top of `CHANGELOG.md`]
 - How it runs: [Docker Compose (the default), or installed without Docker]
 - What is in front of it: [the bundled nginx alone, Cloudflare Tunnel, Traefik, Caddy or another proxy; plain HTTP or HTTPS]
 - Did it work in an earlier version? [which one]

**Your computer**
 - OS: [e.g. Windows 11, macOS, iOS]
 - Browser and its version: [e.g. Firefox 130, Safari 17]
 - Phone or tablet, if that is where it happens: [e.g. iPhone 12]

**Additional context**
Add any other context about the problem here.
