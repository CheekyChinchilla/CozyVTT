"""No tracked text file names another company's product for a feature of ours.

Paint is described in its own words; naming the commercial program it
resembles invites a trademark question for no gain. The same names are refused
in commit messages by the local commit check. CozyVTT's look is described in
its own words too, never as inspired by an animation studio's films, and a
planned feature by what it is, never by what another tabletop program calls
it. The patterns are kept encoded, so the repository carries no product name
even here; a type foundry credited for a font is not one.
"""

import os
import re
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
NAMES = re.compile(bytes.fromhex('5c624d535b202d5d3f5061696e745c627c5c624d6963726f736f6674205061696e745c627c5c626d737061696e745c62').decode(), re.I)
STUDIO = re.compile(bytes.fromhex('5c62476869626c695c62').decode(), re.I)
TABLETOPS = re.compile(bytes.fromhex('5c62526f6c6c32305c627c283f3c21547970652029283f3c21636c6f75642d295c62466f756e6472795c62').decode(), re.I)


def lines_naming(pattern):
    """Each tracked text file's lines that `pattern` finds, as `path:line`."""
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
            if pattern.search(line):
                found.append(f'{name}:{number}')
    return found


class ProductNames(unittest.TestCase):
    def test_no_tracked_text_file_names_the_commercial_paint_program(self):
        self.assertEqual(lines_naming(NAMES), [])

    def test_no_tracked_text_file_names_the_animation_studio(self):
        self.assertEqual(lines_naming(STUDIO), [])

    def test_no_tracked_text_file_names_another_tabletop_program(self):
        self.assertEqual(lines_naming(TABLETOPS), [])


if __name__ == '__main__':
    unittest.main()
