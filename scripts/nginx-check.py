"""
Does the bundled nginx start with the configuration CozyVTT ships?

nginx refuses to start on a mistake in its configuration, and the site is down
until someone reads its log. This renders the configuration the way the nginx
container does when it starts, then asks nginx to check it (`nginx -T`, which
also prints what it read), three times:

  as shipped      nginx/nginx.conf rendered by the image's own entrypoint, with
                  nginx/trusted-proxies.envsh, the environment docker-compose.yml
                  gives the container, and nginx/locations.conf where the
                  template includes it;
  with proxies    the same, with NGINX_TRUSTED_PROXIES naming an address, a
                  range and an IPv6 range, so the lines the script renders for
                  them are checked as well, and must appear;
  with HTTPS      the nginx/conf.d/https.conf example from docs/DEPLOYMENT.md in
                  nginx/conf.d/, with a throwaway self-signed certificate whose
                  key is readable by the account running this check alone, as
                  the guide's `cp` and `chown` steps leave a real one.

The image, environment, mounts and the settings that limit what the container
may do (its capabilities, no-new-privileges, a read-only filesystem and its
tmpfs folders) come from the nginx service in docker-compose.yml, so the check
follows it and nginx starts as it does there; each value takes its default, as
on an instance whose .env leaves it out. The repository's own nginx/conf.d/ and
nginx/certs/ are never mounted: a developer's own HTTPS file stays out of it.

Needs Docker, openssl and PyYAML (pip install pyyaml). Run from the repository
root; exits non-zero when nginx refuses any of the three:

    python3 scripts/nginx-check.py
"""

import collections
import io
import os
import re
import subprocess
import sys
import tempfile
import textwrap

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COMPOSE = os.path.join(ROOT, 'docker-compose.yml')
GUIDE = os.path.join(ROOT, 'docs', 'DEPLOYMENT.md')

# Documentation addresses (RFC 5737 and RFC 3849), a list written the ways
# .env allows: separated by a comma and by spaces.
TRUSTED_PROXIES = '203.0.113.7, 198.51.100.0/24 2001:db8::/32'
RENDERED = ('set_real_ip_from 203.0.113.7;', 'set_real_ip_from 198.51.100.0/24;', 'set_real_ip_from 2001:db8::/32;',
            '203.0.113.7 1;', '198.51.100.0/24 1;', '2001:db8::/32 1;')


def read(path):
    with io.open(path, encoding='utf-8') as f:
        return f.read()


def interpolate(value):
    """A compose value with each `${NAME:-default}` or `${NAME}` given its default, as with no .env."""
    return re.sub(r'\$\{(\w+)(?::?-([^}]*))?\}', lambda m: m.group(2) or '', str(value))


Service = collections.namedtuple('Service', 'image environment volumes flags')


def run_flags(service):
    """docker run arguments for the service's settings that limit what the container may do."""
    flags = []
    for option in service.get('security_opt') or []:
        flags += ['--security-opt', option]
    for capability in service.get('cap_drop') or []:
        flags += ['--cap-drop', capability]
    for capability in service.get('cap_add') or []:
        flags += ['--cap-add', capability]
    if service.get('read_only'):
        flags.append('--read-only')
    for folder in service.get('tmpfs') or []:
        flags += ['--tmpfs', folder]
    return flags


def nginx_service(compose_text):
    """The nginx service's image, environment, mounts and run flags from docker-compose.yml."""
    import yaml  # here, so the pure helpers above load without PyYAML
    service = yaml.safe_load(compose_text)['services']['nginx']
    environment = service.get('environment') or {}
    if isinstance(environment, list):
        environment = dict(item.split('=', 1) for item in environment)
    return Service(service['image'], {key: interpolate(value) for key, value in environment.items()},
                   service.get('volumes') or [], run_flags(service))


def https_example(guide_text):
    """The nginx/conf.d/https.conf the deployment guide gives, as a self-hoster copies it."""
    for indent, body in re.findall(r'^( *)```nginx\n(.*?)^\1```', guide_text, re.M | re.S):
        example = textwrap.dedent(body)
        if example.lstrip().startswith('# nginx/conf.d/https.conf'):
            return example
    raise SystemExit('docs/DEPLOYMENT.md has no ```nginx block starting "# nginx/conf.d/https.conf"')


def mounts(volumes, conf_d, certs):
    """docker run -v arguments for the service's mounts, its own folders swapped for the given ones and its named volumes for throwaway ones."""
    out = []
    for volume in volumes:
        if not isinstance(volume, str):
            raise SystemExit(f'docker-compose.yml: teach scripts/nginx-check.py this nginx mount: {volume!r}')
        source, target, *mode = volume.split(':')
        if source == './nginx/conf.d':
            source = conf_d
        elif source == './nginx/certs':
            source = certs
        elif source.startswith('./'):
            source = os.path.join(ROOT, source[2:])
        elif re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]*', source):
            # A named volume: a throwaway one in its place, which docker run
            # --rm removes with the container.
            out += ['-v', target]
            continue
        else:
            raise SystemExit(f'docker-compose.yml: teach scripts/nginx-check.py this nginx mount: {volume!r}')
        out += ['-v', ':'.join([source, target] + mode)]
    return out


def nginx_t(service, environment, conf_d, certs):
    """nginx -T in a throwaway container, as (passed, everything it printed)."""
    args = ['docker', 'run', '--rm', '--network', 'none'] + service.flags
    for key, value in environment.items():
        args += ['-e', f'{key}={value}']
    args += mounts(service.volumes, conf_d, certs) + [service.image, 'nginx', '-T']
    run = subprocess.run(args, capture_output=True, text=True)
    printed = run.stdout + run.stderr
    return run.returncode == 0 and 'test is successful' in run.stderr, printed


def main():
    service = nginx_service(read(COMPOSE))
    image, environment = service.image, service.environment
    failed = False
    with tempfile.TemporaryDirectory() as tmp:
        empty, conf_d, certs = (os.path.join(tmp, name) for name in ('empty', 'conf.d', 'certs'))
        for folder in (empty, conf_d, certs):
            os.mkdir(folder)
        with io.open(os.path.join(conf_d, 'https.conf'), 'w', encoding='utf-8') as f:
            f.write(https_example(read(GUIDE)))
        subprocess.run(
            ['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=your-domain.com',
             '-keyout', os.path.join(certs, 'server.key'), '-out', os.path.join(certs, 'server.crt')],
            check=True, capture_output=True,
        )
        for folder in (empty, conf_d, certs):
            os.chmod(folder, 0o755)
        # The guide copies the key in with sudo and gives it to the account
        # that runs CozyVTT: readable by that account alone. nginx reads it as
        # root, and only the capability the compose file gives it lets it.
        os.chmod(os.path.join(certs, 'server.crt'), 0o644)
        os.chmod(os.path.join(certs, 'server.key'), 0o600)
        if os.geteuid() == 0:
            os.chown(os.path.join(certs, 'server.key'), 1000, 1000)

        runs = (
            ('as shipped', environment, empty, empty, ()),
            ('with proxies', {**environment, 'NGINX_TRUSTED_PROXIES': TRUSTED_PROXIES}, empty, empty, RENDERED),
            ('with HTTPS', environment, conf_d, certs, ('listen 443 ssl;', 'include /etc/nginx/cozyvtt/locations.conf;')),
        )
        for label, env, conf, cert, expected in runs:
            passed, printed = nginx_t(service, env, conf, cert)
            missing = [line for line in expected if line not in printed]
            if passed and not missing:
                print(f'{image} {label}: nginx accepts the configuration')
                continue
            failed = True
            print(f'{image} {label}: ' + ('nginx refuses the configuration' if not passed else f'rendered without {missing}'))
            print(textwrap.indent(printed.strip()[-4000:], '    '))
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
