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

- **Wrong passwords.** Counted twice: 5 per 15 minutes per visitor address, and 10 per hour per account from every address together, each lock noted in the admins' activity log. The password confirmed when changing the password or email or deleting the account has its own allowance of 10 per 15 minutes per account. Only a wrong answer ever counts, so correct sign-ins arriving together never lock anyone out, and an email with no account is counted and answered exactly as a wrong password, so the limits reveal nothing about who has an account. An unknown email is checked against a dummy password hash, so the time a sign-in takes reveals nothing either.

- **What a session alone can do.** Anything that decides who can sign in from then on asks for the current password: changing it, changing the email address, turning two-factor authentication on or off, deleting the account. The admin reset routes ask for none, so they refuse the administrator's own account; an admin resetting someone else is written to the activity log. A password reset link is issued at most once every 5 minutes per account, and reset links are limited per address as well.

- **Sessions.** A sign-in ends after an hour without a request (30 days with Remember me), and in any case 30 days after it was made (`REMEMBER_ME_MAX_AGE`), however active. An account keeps at most 20 live sign-ins. Changing or resetting a password, changing a role, turning two-factor authentication on or off and deleting an account end the account's other sign-ins, pending two-factor sign-ins included; a failure to do so fails the request. The session table holds the user id and role only.

- **Administrators and two-factor authentication.** An administrator account must have two-factor authentication on. One without it has 7 days from the upgrade that introduced the rule, or from the account's creation, to set it up; a banner says so on every page, and after the deadline the account can do nothing but set it up or sign out. The date the rule started on an instance is the first "Administrator accounts must use two-factor authentication" line in the admins' activity log.

- **What a backup holds.** A backup is a full database dump, readable by whoever holds the file. Password hashes are Argon2id and backup codes are hashed; password reset and invitation links are stored as SHA-256 hashes of the token, so the dump holds no working link. **Two-factor (TOTP) secrets are stored as they are**, so a leaked backup lets a cracked password alone sign in to an account that has two-factor on. Encrypting them needs a key from the environment: a safe default with no new required setting would derive it from `SESSION_SECRET`, but rotating that secret would then break every authenticator. The decision for now is to leave them as they are and keep backups where only the administrator can read them; revisit when a key management story exists.

- **Two-factor sign-ins.** A sign-in that has passed the password step but not the code is not signed in anywhere: the HTTP guards, the admin guards and the live-table handshake all read one definition. It expires 5 minutes after the password step, and it ends whenever the account's password is changed or reset or its sessions are ended for another reason.

Known issues and deliberately deferred work are tracked in [docs/FUTURE_FEATURES.md](docs/FUTURE_FEATURES.md).
