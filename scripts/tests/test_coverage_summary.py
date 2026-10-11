"""scripts/coverage-summary.py turns a coverage-summary.json into the CI job's table."""

import importlib.util
import os
import unittest

SCRIPTS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location('coverage_summary', os.path.join(SCRIPTS, 'coverage-summary.py'))
cs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cs)


def counts(covered, total):
    return {kind: {'covered': covered, 'total': total, 'skipped': 0, 'pct': 0} for kind in cs.KINDS}


class Table(unittest.TestCase):
    def test_gives_the_totals_and_a_row_per_folder_under_src(self):
        summary = {
            'total': counts(3, 4),
            '/ci/backend/src/routes/auth.ts': counts(1, 2),
            '/ci/backend/src/routes/maps.ts': counts(1, 1),
            '/ci/backend/src/app.ts': counts(1, 1),
            '/ci/backend/src/services/empty.ts': counts(0, 0),
        }
        text = cs.table('Backend', summary)
        self.assertIn('| **All** | **75.0%** | **75.0%** | **75.0%** | **75.0%** |', text)
        self.assertIn('| `routes` | 66.7% | 66.7% | 66.7% | 66.7% |', text)
        self.assertIn('| `(src)` | 100.0% |', text)
        self.assertIn('| `services` | 100% |', text)


if __name__ == '__main__':
    unittest.main()
