"""No tracked guide calls the campaign's game master the DM.

The role is "game master" in prose and "GM" for short. This reads the prose
of every tracked Markdown file: code spans and fenced blocks are left out,
since they hold `DM`, the value older versions stored, and code that reads
it. The changelog is read whole. Skipped: the page left at the guide's old
path to point to its new one, and the API notes of released versions.

    python3 -m unittest discover -s scripts/tests

Run from the repository root. Standard library only.
"""

import os
import re
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

ROLE = re.compile(r"\bDMs?\b|DM['’]s")
FENCE = re.compile(r'^\s{0,3}(`{3,}|~{3,})')
CODE_SPAN = re.compile(r'(`+)(?!`).*?(?<!`)\1(?!`)')
# The page at the guide's old address, which says where it went.
POINTER = 'docs/DM_GUIDE.md'
# Released API notes, kept as written.
RELEASED_API_NOTES = {
    'docs/api-changes/1.5.1.md',
    'docs/api-changes/1.5.2.md',
    'docs/api-changes/1.5.3.md',
    'docs/api-changes/1.5.4.md',
    'docs/api-changes/1.6.0.md',
}


def tracked_markdown():
    out = subprocess.run(['git', '-C', ROOT, 'ls-files', '-z', '--', '*.md'], capture_output=True, check=True).stdout.decode()
    return [name for name in out.split('\0') if name]


def prose(text):
    """Each line of the text outside fences, with its code spans taken out, and its number."""
    fence = None
    for number, line in enumerate(text.splitlines(), 1):
        opened = FENCE.match(line)
        if fence:
            if opened and opened.group(1)[0] == fence[0] and len(opened.group(1)) >= len(fence):
                fence = None
            continue
        if opened:
            fence = opened.group(1)
            continue
        yield number, CODE_SPAN.sub('', line)


def lines_calling_the_role_dm(name, text):
    return [f'{name}:{number}' for number, line in prose(text) if ROLE.search(line)]


class GmWording(unittest.TestCase):
    def test_no_doc_calls_the_role_dm(self):
        found = []
        for name in tracked_markdown():
            if name == POINTER or name in RELEASED_API_NOTES:
                continue
            with open(os.path.join(ROOT, name), encoding='utf-8') as f:
                found += lines_calling_the_role_dm(name, f.read())
        self.assertEqual(found, [])

    def test_the_stored_role_in_code_is_not_counted(self):
        text = 'The role `DM` is shown as GM.\n\n```ts\nif (role === "DM") {}\n```\n'
        self.assertEqual(lines_calling_the_role_dm('x.md', text), [])

    def test_the_word_in_prose_is_counted(self):
        for line in ['Ask your DM.', 'Only DMs see it.', "The DM's notes.", 'The DM’s notes.', 'DM-only']:
            with self.subTest(line=line):
                self.assertEqual(lines_calling_the_role_dm('x.md', line), ['x.md:1'])

    def test_a_name_that_holds_the_letters_is_not_counted(self):
        for line in ['See [the guide](docs/DM_GUIDE.md).', 'The `isDM` flag.', 'An ADMIN.']:
            with self.subTest(line=line):
                self.assertEqual(lines_calling_the_role_dm('x.md', line), [])

    def test_the_changelog_is_read_to_its_end(self):
        text = '## [Unreleased]\n\nThe GM.\n\n## [1.6.0] - 2026-11-09\n\nThe DM.\n'
        self.assertEqual(lines_calling_the_role_dm('CHANGELOG.md', text), ['CHANGELOG.md:7'])

    def test_the_pointer_and_the_released_notes_are_files_that_exist(self):
        tracked = set(tracked_markdown())
        for name in {POINTER} | RELEASED_API_NOTES:
            with self.subTest(name=name):
                self.assertIn(name, tracked)


if __name__ == '__main__':
    unittest.main()
