"""
Do the API documents still match the routes the server actually mounts?

Two documents describe the HTTP surface, and they promise different things:

  backend/docs/API_DOCUMENTATION.yaml   the complete catalogue. Checked in both
                                        directions: every route has an entry,
                                        and every entry is a real route.

  docs/API_REFERENCE.md                 a hand-written guide covering the
                                        endpoints people ask about. Not
                                        complete, and does not claim to be — so
                                        only checked for the dangerous
                                        direction: it must not describe a route
                                        that does not exist. Twelve of those had
                                        accumulated, all wrong paths rather than
                                        removed features, quietly sending
                                        readers to a 404.

    python scripts/spec-coverage.py

Run from the repository root. Exits non-zero on any mismatch that matters.
"""

import io
import os
import re
import sys

# A Windows console defaults to cp1252 and cannot encode the dashes below.
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SERVER = os.path.join(ROOT, 'backend', 'src', 'server.ts')
ROUTES = os.path.join(ROOT, 'backend', 'src', 'routes')
SPEC = os.path.join(ROOT, 'backend', 'docs', 'API_DOCUMENTATION.yaml')
GUIDE = os.path.join(ROOT, 'docs', 'API_REFERENCE.md')

read = lambda p: io.open(p, encoding='utf-8').read()
# Both `:id` and `{id}` collapse to the same thing, and a trailing slash is noise.
norm = lambda e: re.sub(r'\{[^}]+\}', ':x', re.sub(r':\w+', ':x', e)).rstrip('/')


def routed():
    """Every method+path the server mounts, from server.ts and the routers."""
    srv = read(SERVER)
    mounts, found = {}, set()
    for m in re.finditer(r"app\.use\('([^']+)',\s*(\w+)", srv):
        mounts.setdefault(m.group(2), m.group(1))
    imports = dict(re.findall(r"import\s+(\w+)\s+from\s+'\./routes/([\w-]+)'", srv))

    for var, prefix in mounts.items():
        name = imports.get(var)
        path = os.path.join(ROUTES, f'{name}.ts') if name else None
        if not path or not os.path.exists(path):
            continue
        for m in re.finditer(r"router\.(get|post|put|patch|delete)\(\s*'([^']*)'", read(path)):
            p = m.group(2)
            full = (prefix + ('' if p == '/' else p)).replace('//', '/')
            found.add(f'{m.group(1).upper()} {full}')

    # Routes mounted straight onto the app, such as /health.
    for m in re.finditer(r"app\.(get|post|put|delete)\('(/[^']*)'", srv):
        found.add(f'{m.group(1).upper()} {m.group(2)}')
    return {norm(x) for x in found}


def in_spec():
    """Paths in the OpenAPI document, by method."""
    out, current = set(), None
    for line in read(SPEC).split('\n'):
        m = re.match(r'^  (/\S*):\s*$', line)
        if m:
            current = m.group(1)
            continue
        m2 = re.match(r'^    (get|post|put|patch|delete):\s*$', line)
        if m2 and current:
            out.add(norm(f'{m2.group(1).upper()} {current}'))
    return out


def in_guide():
    """Endpoints the markdown guide gives a heading to."""
    return {
        norm(f'{m.group(1)} {m.group(2).strip()}')
        for m in re.finditer(r'^###\s+`(GET|POST|PUT|PATCH|DELETE)\s+([^`]+)`', read(GUIDE), re.M)
    }


def main():
    code, spec, guide = routed(), in_spec(), in_guide()
    failed = False

    print(f'{len(code)} routes mounted\n')

    print(f'backend/docs/API_DOCUMENTATION.yaml — {len(spec)} documented')
    for label, missing in (('not documented', code - spec), ('documented but not routed', spec - code)):
        if missing:
            failed = True
            print(f'  {label} ({len(missing)}):')
            for x in sorted(missing):
                print('    ', x)
    if not (code - spec) and not (spec - code):
        print('  complete, and nothing documented that is not routed')

    print(f'\ndocs/API_REFERENCE.md — {len(guide)} documented, completeness not claimed')
    ghosts = guide - code
    if ghosts:
        failed = True
        print(f'  describes routes that do not exist ({len(ghosts)}):')
        for x in sorted(ghosts):
            print('    ', x)
    else:
        print(f'  no invented endpoints ({len(code - guide)} routes it does not cover, which is allowed)')

    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
