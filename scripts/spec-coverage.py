"""
Do the API documents still match the routes the server actually mounts?

Two documents describe the HTTP surface, and they promise different things.
The frontend's API client is checked against the first, so a route renamed
in the routers and the catalogue fails here before the page's request
answers 404:

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

  frontend/src/services/api.ts          every request the page's API client
                                        sends must be in the catalogue.

    python3 scripts/spec-coverage.py

Run from the repository root. Exits non-zero on any mismatch that matters,
and on any route declaration or router mount it cannot read: a path held in a
variable or worked out in a template, `router.route()`, `router.all()`, or a
router mounted inside another. Each would leave a route out of the count
while the check passed.
"""

import io
import os
import re
import sys

# A Windows console defaults to cp1252 and cannot encode the dashes below.
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# The shared source reader sits beside this file; put its folder on the path
# so this also loads when imported from elsewhere, as the tests do.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tssource import closing, interpolation_end, line_of, literal_end, masked  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# createApp in app.ts mounts every router; server.ts only starts it, and
# anything it mounted itself would be read too.
APP_FILES = [os.path.join(ROOT, 'backend', 'src', 'app.ts'), os.path.join(ROOT, 'backend', 'src', 'server.ts')]
ROUTES = os.path.join(ROOT, 'backend', 'src', 'routes')
SPEC = os.path.join(ROOT, 'backend', 'docs', 'API_DOCUMENTATION.yaml')
GUIDE = os.path.join(ROOT, 'docs', 'API_REFERENCE.md')
CLIENT = os.path.join(ROOT, 'frontend', 'src', 'services', 'api.ts')

read = lambda p: io.open(p, encoding='utf-8').read()
# Both `:id` and `{id}` collapse to the same thing, and a trailing slash is noise.
norm = lambda e: re.sub(r'\{[^}]+\}', ':x', re.sub(r':\w+', ':x', e)).rstrip('/')


# A path the check can read: a quoted string, or a template with nothing
# worked out inside it.
PATH = r"""(?:'([^'\n]*)'|"([^"\n]*)"|`([^`$\n]*)`)"""
METHODS = ('get', 'post', 'put', 'patch', 'delete')


def literal(match, first):
    """The path a PATH match read, from its three groups starting at `first`."""
    return next(g for g in match.groups()[first - 1:first + 2] if g is not None)


def where(path, text, index):
    return f"{os.path.relpath(path, ROOT).replace(os.sep, '/')}:{line_of(text, index)}: {text[index:].split(chr(10))[0].strip()}"


def arguments(code, index):
    """The text between the brackets of the call whose `(` is at code[index]."""
    return code[index + 1:closing(code, index)]


def read_inventory():
    """
    (routes, problems): every method and path the app answers, read from
    APP_FILES and the routers they mount, and every declaration or mount on
    the way that could not be read.
    """
    found, problems, mounts, imports = set(), [], [], {}
    for app_file in APP_FILES:
        text = read(app_file)
        code = masked(text, keep_strings=True)
        imports.update(re.findall(r"""import\s+(\w+)\s+from\s+['"]\./routes/([\w-]+)['"]""", code))
        for m in re.finditer(r'\bapp\.use\(', code):
            args = arguments(code, m.end() - 1)
            routers = [var for var in imports if re.search(rf'\b{var}\b', args)]
            if not routers:
                continue  # middleware, such as helmet() or a gate
            mount = re.fullmatch(r'\s*' + PATH + r'\s*,\s*(\w+)\s*', args)
            if mount and mount.group(4) in imports:
                mounts.append((mount.group(4), literal(mount, 1)))
            else:
                problems.append(where(app_file, text, m.start()))
        # Routes on the app itself, such as /health.
        for m in re.finditer(r'\bapp\.(\w+)\(', code):
            method = m.group(1)
            if method not in METHODS + ('all', 'route'):
                continue
            # `app.get('trust proxy')`, one argument, reads a setting.
            if method == 'get' and ',' not in arguments(code, m.end() - 1):
                continue
            route = re.match(r'\s*' + PATH, code[m.end():])
            if method in METHODS and route:
                found.add(f'{method.upper()} {literal(route, 1)}')
            else:
                problems.append(where(app_file, text, m.start()))

    mounted = {var for var, _ in mounts}
    for var in sorted(set(imports) - mounted):
        problems.append(f'{var} is imported from routes/{imports[var]}.ts but never mounted in a form this check reads')

    for var, prefix in mounts:
        path = os.path.join(ROUTES, f'{imports[var]}.ts')
        if not os.path.exists(path):
            problems.append(f'{var} is mounted at {prefix} but routes/{imports[var]}.ts does not exist')
            continue
        text = read(path)
        code = masked(text, keep_strings=True)
        siblings = {name for name, module in re.findall(r"""import\s+(\w+)\s+from\s+['"]\./([\w-]+)['"]""", code)
                    if os.path.exists(os.path.join(ROUTES, f'{module}.ts'))}
        for m in re.finditer(r'\brouter\.(\w+)\(', code):
            method = m.group(1)
            if method == 'use':
                # Middleware is fine; another router mounted here is not read.
                if any(re.search(rf'\b{name}\b', arguments(code, m.end() - 1)) for name in siblings):
                    problems.append(where(path, text, m.start()))
                continue
            if method not in METHODS + ('all', 'route'):
                continue
            route = re.match(r'\s*' + PATH, code[m.end():])
            if method in METHODS and route:
                p = literal(route, 1)
                found.add(f"{method.upper()} {(prefix + ('' if p == '/' else p)).replace('//', '/')}")
            else:
                problems.append(where(path, text, m.start()))
    # Each problem once, though a router mounted twice is read twice.
    return {norm(x) for x in found}, list(dict.fromkeys(problems))


def routed():
    """Every method+path the app mounts."""
    return read_inventory()[0]


def unreadable():
    """Route declarations and router mounts this check could not read."""
    return read_inventory()[1]


def address(text, i):
    """
    The request address in the string or template literal at text[i], as a
    path with `:x` for each part worked out at run time and without its query
    string; None when there is no literal there. A leading `${API_BASE_URL}`
    is the server's origin and is dropped.
    """
    end = literal_end(text, i)
    if end is None or text[i] not in '\'"`':
        return None
    body, out, j = text[i + 1:end - 1], [], 0
    while j < len(body):
        if body.startswith('${', j):
            close = interpolation_end(body, j + 2)
            out.append('' if j == 0 and body[j + 2:close - 1].strip() == 'API_BASE_URL' else ':x')
            j = close
        else:
            out.append(body[j])
            j += 1
    return ''.join(out).split('?')[0]


def client_calls():
    """
    (requests, problems): every method and path frontend/src/services/api.ts
    sends a request to, through its axios client or fetch, and every request
    whose address is not a literal this can read.
    """
    text = read(CLIENT)
    code = masked(text, keep_strings=True)
    calls, problems = set(), []
    for m in re.finditer(r'\bthis\.client\.(get|post|put|patch|delete)\b|\bfetch\b', code):
        i = m.end()
        while i < len(code) and code[i].isspace():
            i += 1
        if code.startswith('<', i):  # a type argument, such as get<{ user: User }>
            depth = 0
            while i < len(code):
                if code[i] == '<':
                    depth += 1
                elif code[i] == '>' and code[i - 1] != '=':
                    depth -= 1
                    if depth == 0:
                        i += 1
                        break
                i += 1
        if not code.startswith('(', i):
            continue
        start = i + 1
        while start < len(code) and code[start].isspace():
            start += 1
        path = address(text, start)
        if m.group(1):
            method = m.group(1).upper()
        else:
            options = re.search(r"""method:\s*['"](\w+)['"]""", code[start:closing(code, i)])
            method = options.group(1).upper() if options else 'GET'
        if path is None or not path.startswith('/api/'):
            problems.append(where(CLIENT, text, m.start()))
        else:
            calls.add(norm(f'{method} {path}'))
    return calls, problems


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


def spec_parses():
    """
    The OpenAPI document loads as YAML at all. The line-based reads above do
    not care, but every tool that renders the file does, and three unquoted
    colons once left it unloadable for months. Needs PyYAML; without it the
    check says so and is skipped, and CI, which installs it, still runs it.
    """
    try:
        import yaml
    except ImportError:
        print('backend/docs/API_DOCUMENTATION.yaml — not parsed: PyYAML is not installed (pip install pyyaml); CI checks it\n')
        return True
    try:
        with io.open(SPEC, encoding='utf-8') as f:
            yaml.safe_load(f)
    except yaml.YAMLError as e:
        print(f'backend/docs/API_DOCUMENTATION.yaml — not valid YAML:\n  {e}\n')
        return False
    print('backend/docs/API_DOCUMENTATION.yaml — parses as YAML\n')
    return True


def main():
    code, problems = read_inventory()
    spec, guide = in_spec(), in_guide()
    failed = not spec_parses()

    if problems:
        failed = True
        print(f'Route declarations this check cannot read ({len(problems)}), so the counts below leave them out.')
        print('Write the path as a quoted string, or teach read_inventory() the form:')
        for problem in problems:
            print('    ', problem)
        print()

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

    requests, unread = client_calls()
    print(f'\nfrontend/src/services/api.ts — {len(requests)} requests')
    unknown = requests - spec
    if unread:
        failed = True
        print(f'  requests whose address this check cannot read ({len(unread)}):')
        for x in unread:
            print('    ', x)
    if unknown:
        failed = True
        print(f'  sent to routes the catalogue does not have ({len(unknown)}):')
        for x in sorted(unknown):
            print('    ', x)
    if not unread and not unknown:
        print('  every one is in the catalogue')

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
