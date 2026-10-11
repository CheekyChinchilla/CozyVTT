"""
A test run's coverage as a Markdown table, for the CI job summary.

Jest and Vitest both write coverage/coverage-summary.json when given the
`json-summary` reporter. This prints the totals and one row per folder under
src/, so the numbers are seen on every run. It is a report: nothing fails on
a low number yet.

    python3 scripts/coverage-summary.py Backend backend/coverage/coverage-summary.json
"""

import io
import json
import os
import sys

KINDS = ('lines', 'statements', 'functions', 'branches')


def percent(covered, total):
    return '100%' if total == 0 else f'{100 * covered / total:.1f}%'


def table(label, summary):
    folders = {}
    for path, counts in summary.items():
        if path == 'total':
            continue
        parts = path.replace(os.sep, '/').split('/')
        folder = parts[parts.index('src') + 1] if 'src' in parts[:-1] else '(other)'
        if folder.endswith(('.ts', '.tsx')):
            folder = '(src)'
        sums = folders.setdefault(folder, {kind: [0, 0] for kind in KINDS})
        for kind in KINDS:
            sums[kind][0] += counts[kind]['covered']
            sums[kind][1] += counts[kind]['total']
    rows = [f'### {label} coverage', '', '| | ' + ' | '.join(k.capitalize() for k in KINDS) + ' |', '| --- |' + ' ---: |' * len(KINDS)]
    total = summary['total']
    rows.append('| **All** | ' + ' | '.join(f"**{percent(total[k]['covered'], total[k]['total'])}**" for k in KINDS) + ' |')
    for folder in sorted(folders):
        rows.append(f'| `{folder}` | ' + ' | '.join(percent(*folders[folder][k]) for k in KINDS) + ' |')
    return '\n'.join(rows) + '\n'


def main(argv):
    if len(argv) != 3:
        print(__doc__.strip().split('\n\n')[-1])
        return 2
    with io.open(argv[2], encoding='utf-8') as f:
        print(table(argv[1], json.load(f)))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
