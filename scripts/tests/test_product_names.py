"""No tracked text file names another company's product for a feature of ours.

Paint is described in its own words; naming the commercial program it
resembles invites a trademark question for no gain. The same names are refused
in commit messages by the local commit check. The pattern is kept encoded, so
the repository carries no product name even here.
"""

import os
import re
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
NAMES = re.compile(bytes.fromhex('5c624d535b202d5d3f5061696e745c627c5c624d6963726f736f6674205061696e745c627c5c626d737061696e745c62').decode(), re.I)


class ProductNames(unittest.TestCase):
    def test_no_tracked_text_file_names_the_commercial_paint_program(self):
        files = subprocess.run(['git', '-C', ROOT, 'ls-files', '-z'], capture_output=True, check=True).stdout.decode().split('\0')
        found = []
        for name in files:
            if not name:
                continue
            try:
                with open(os.path.join(ROOT, name), encoding='utf-8') as f:
                    text = f.read()
            except (UnicodeDecodeError, FileNotFoundError, IsADirectoryError):
                continue
            for number, line in enumerate(text.splitlines(), 1):
                if NAMES.search(line):
                    found.append(f'{name}:{number}')
        self.assertEqual(found, [])


if __name__ == '__main__':
    unittest.main()
