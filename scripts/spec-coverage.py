"""
Does the OpenAPI spec still describe the routes the server actually mounts?

The spec drifts the moment a route is added without a matching entry, which is
how it came to be missing eleven endpoints while still looking maintained. This
walks server.ts for the mount prefixes, each router for its paths, and compares
that set against the paths in the spec.

Run from the backend directory. Exits non-zero if anything is routed but
undocumented, so it can be a CI step.
"""

import io, re, os, sys

mounts, srv = {}, io.open('src/server.ts', encoding='utf-8').read()
for m in re.finditer(r"app\.use\('([^']+)',\s*(\w+)", srv):
    mounts.setdefault(m.group(2), m.group(1))
imports = dict(re.findall(r"import\s+(\w+)\s+from\s+'\./routes/([\w-]+)'", srv))

actual = set()
for var, prefix in mounts.items():
    f = imports.get(var)
    if not f or not os.path.exists(f'src/routes/{f}.ts'):
        continue
    s = io.open(f'src/routes/{f}.ts', encoding='utf-8').read()
    for mm in re.finditer(r"router\.(get|post|put|patch|delete)\(\s*'([^']*)'", s):
        p = mm.group(2)
        full = (prefix + ('' if p == '/' else p)).replace('//', '/')
        actual.add(f'{mm.group(1).upper()} {full}')
for mm in re.finditer(r"app\.(get|post|put|delete)\('(/[^']*)'", srv):
    actual.add(f'{mm.group(1).upper()} {mm.group(2)}')

doc, cur, documented = io.open('docs/API_DOCUMENTATION.yaml', encoding='utf-8').read(), None, set()
for line in doc.split('\n'):
    m = re.match(r'^  (/\S*):\s*$', line)
    if m:
        cur = m.group(1); continue
    m2 = re.match(r'^    (get|post|put|patch|delete):\s*$', line)
    if m2 and cur:
        documented.add(f'{m2.group(1).upper()} {cur}')

norm = lambda e: re.sub(r'\{[^}]+\}', ':x', re.sub(r':\w+', ':x', e)).rstrip('/')
a, d = {norm(x) for x in actual}, {norm(x) for x in documented}
print(f'actual {len(a)} / documented {len(d)}')
print('UNDOCUMENTED:', *sorted(a - d), sep='\n  ') if a - d else print('UNDOCUMENTED: none')
print('SPEC-ONLY   :', *sorted(d - a), sep='\n  ') if d - a else print('SPEC-ONLY   : none')
sys.exit(1 if (a - d) else 0)
