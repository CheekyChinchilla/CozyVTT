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

Known issues and deliberately deferred work are tracked in [docs/FUTURE_FEATURES.md](docs/FUTURE_FEATURES.md).
