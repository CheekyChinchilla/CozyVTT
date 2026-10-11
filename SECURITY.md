# Security Policy

CozyVTT is a self-hosted virtual tabletop platform. We take security seriously and appreciate responsible disclosure from the community.

## Supported Versions

Since this software is still considered beta/WIP support is always only given for the latest version. Security patches are only available for the latest version and not back-ported to older versions.

Self-hosters are responsible for keeping their instances up to date.

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.** Public disclosure before a fix is available puts every self-hosted instance at risk.

### Preferred — GitHub Private Vulnerability Reporting

Use the **"Report a vulnerability"** button on the [Security tab](https://github.com/CheekyChinchilla/CozyVTT/security) of this repository. This creates a private advisory that only repository maintainers can see.

## Notes on the security design

Decisions a self-hoster or a reviewer may want to know about. The deployment guide's [Hardening Checklist](docs/DEPLOYMENT.md#hardening-checklist) says what to do; this says why the app behaves as it does.

- **First administrator.** Until the setup wizard has run, the instance refuses everything except the wizard, and the wizard asks for a one-time setup token that the backend prints in its log at start (or `SETUP_TOKEN` from `.env`). A stranger who reaches a fresh instance first therefore cannot make themselves its administrator. Finish setup before you share the address all the same.

- **Wrong passwords.** Counted twice: 5 per 15 minutes per visitor address, and 10 per hour per account from every address together, each lock noted in the admins' activity log. The password confirmed when changing the password or email or deleting the account has its own allowance of 10 per 15 minutes per account. Only a wrong answer ever counts, so correct sign-ins arriving together never lock anyone out, and an email with no account is counted and answered exactly as a wrong password, so the limits reveal nothing about who has an account. An unknown email is checked against a dummy password hash, so the time a sign-in takes reveals nothing either. A new password, however it is set, clears the account's count at once, so nobody can keep an account locked whose owner can reset the password.

- **What a session alone can do.** Anything that decides who can sign in from then on asks for the current password: changing it, changing the email address, turning two-factor authentication on or off, deleting the account. The admin reset routes ask for none, so they refuse the administrator's own account; an admin resetting someone else is written to the activity log. Forgot password issues at most one reset link every 5 minutes per account (an administrator's Send reset link and Resend invite are not under that cooldown), and reset links are limited per address as well.

- **Sessions.** A sign-in ends after an hour without a request (30 days with Remember me), and in any case 30 days after it was made (`REMEMBER_ME_MAX_AGE`), however active. An account keeps at most 20 live sign-ins. Changing or resetting a password, changing a role, turning two-factor authentication on or off and deleting an account end the account's other sign-ins, pending two-factor sign-ins included; a failure to do so fails the request. The session table holds the user id and role, when the sign-in was made, whether a password change is still required, and the two-factor pending state; never the password or a token.

- **Administrators and two-factor authentication.** An administrator account must have two-factor authentication on. One without it has 7 days to set it up, counted from the latest of the upgrade that introduced the rule, the account's creation, its promotion to administrator and a Reset MFA by another administrator; a banner says so on every page, and after the deadline the account can do nothing but set it up or sign out. Each of those moments is a line in the admins' activity log: the date the rule started on an instance is the first "Administrator accounts must use two-factor authentication" line, and promotions and resets are written there as they happen.

- **What a backup holds.** A backup is a full database dump, readable by whoever holds the file. Password hashes are Argon2id and backup codes are hashed; password reset and invitation links are stored as SHA-256 hashes of the token, so the dump holds no working link. **Two-factor (TOTP) secrets are stored as they are**, so a leaked backup lets a cracked password alone sign in to an account that has two-factor on. Encrypting them needs a key from the environment: a safe default with no new required setting would derive it from `SESSION_SECRET`, but rotating that secret would then break every authenticator. The decision for now is to leave them as they are and keep backups where only the administrator can read them; revisit when a key management story exists.

- **Who may name a visitor's address.** The per-address limits count the address the bundled nginx settles on. nginx believes the `X-Forwarded-For` and `X-Forwarded-Proto` headers only from its own loopback and from the addresses listed in `NGINX_TRUSTED_PROXIES` in `.env`, which is empty by default. Earlier versions believed them from every private address, which let a visitor whom Docker relays from its own gateway (one connecting over IPv6, or any visitor on Docker Desktop or rootless Docker) choose the address they were counted as. The cost of the narrower default is one line in `.env` for anyone with a tunnel or proxy in front of nginx.

- **The database role.** The backend connects to PostgreSQL as the role `docker-compose.yml` creates from `DATABASE_USER`, which the official PostgreSQL image makes a superuser. A superuser can run programs inside the database container and read its files, so SQL that reached the database by any route would run with that power. Restoring a backup is such a route: the restore checks a dump's statements, but that check is not a sandbox, which is why the deployment guide says to restore only backups you trust. A separate role that owns CozyVTT's tables without being a superuser would take that power away. That change is recorded for later: the restore replaces the whole schema as the superuser today, and existing installs would need an upgrade that creates the new role without a manual step.

- **Two-factor sign-ins.** A sign-in that has passed the password step but not the code is not signed in anywhere: the HTTP guards, the admin guards and the live-table handshake all read one definition. It expires 5 minutes after the password step, and it ends whenever the account's password is changed or reset or its sessions are ended for another reason.

- **Dependencies.** Every push to the development and release branches checks the packages an instance runs against the published advisories (`npm audit`, reported for now while the current findings are being cleared), and Dependabot proposes updates to them, to the Docker base images and to the CI actions each week. The CI actions are pinned to commits, so a tag moved upstream cannot change what runs. Turning on Dependabot alerts and security updates is a repository setting.

Known issues and deliberately deferred work are tracked in [docs/FUTURE_FEATURES.md](docs/FUTURE_FEATURES.md).
