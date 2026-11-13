"""Tracked text describes CozyVTT as what it is, a self-hosted project.

The pattern is kept encoded so this file
does not match itself. Skipped: licence texts, lock files and the
changelog's released sections.
"""

import os
import re
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PATTERN = re.compile(bytes.fromhex('5c62706169645c627c283f3c2173656c662d29686f737465642028736572766963657c746965727c76657273696f6e7c706c616e297c5c626c6177796572733f5c627c5c626174746f726e6579733f5c627c6c6567616c20636f756e73656c7c5c62636f756e73656c5c62').decode(), re.I)
SKIPPED_FILES = {'LICENSE', 'THIRD_PARTY_NOTICES.txt'}


def skipped(name):
    return name in SKIPPED_FILES or os.path.basename(name) == 'package-lock.json'


class SelfHostedWording(unittest.TestCase):
    def test_tracked_text_describes_a_self_hosted_project(self):
        files = subprocess.run(['git', '-C', ROOT, 'ls-files', '-z'], capture_output=True, check=True).stdout.decode().split('\0')
        found = []
        for name in files:
            if not name or skipped(name):
                continue
            try:
                with open(os.path.join(ROOT, name), encoding='utf-8') as f:
                    text = f.read()
            except (UnicodeDecodeError, FileNotFoundError, IsADirectoryError):
                continue
            if name == 'CHANGELOG.md':
                # Released sections, from 1.6.0 down, are history.
                cut = text.find('## [1.6.0]')
                if cut != -1:
                    text = text[:cut]
            for number, line in enumerate(text.splitlines(), 1):
                if PATTERN.search(line):
                    found.append(f'{name}:{number}')
        self.assertEqual(found, [])


if __name__ == '__main__':
    unittest.main()
