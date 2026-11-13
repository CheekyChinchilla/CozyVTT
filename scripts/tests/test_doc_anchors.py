"""Every link in a tracked Markdown file finds its file, and the heading it names.

A guide links into another guide by the heading's anchor, `[text](FILE.md#a-heading)`.
Renaming the heading leaves every such link pointing nowhere, and the page
opens at its top with nothing to say so; moving or deleting a file does the
same to every link to it. This reads each link in a tracked .md file: an
inline link or picture, `[text](FILE.md#anchor)`, with a title in double or
single quotes or in brackets and a destination in angle brackets too; a
reference, `[ref]: FILE.md#anchor`, in the same forms; and an HTML link or
picture, `<a href=...>` or `<img src=...>`. It checks that the file or
folder is tracked, and that an anchor is one of the file's headings, made the
way GitHub makes them, or an `id`, or an `<a name=...>`, written in it, in any
quotes. A path from `/` starts at the repository's root. Links in code, links
to other sites and footnotes are not read.

    python3 -m unittest discover -s scripts/tests

Run from the repository root. Standard library only.
"""

import os
import re
import subprocess
import tempfile
import textwrap
import unicodedata
import unittest
from urllib.parse import unquote

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

REFERENCE = re.compile(r'^\s{0,3}\[([^\]]+)\]:[ \t]*(.*?)\s*$')
FENCE = re.compile(r'^\s{0,3}(```|~~~)')
HEADING = re.compile(r'^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$')
TAG = re.compile(r'<([a-zA-Z][\w-]*)(\s[^>]*)>')
ATTRIBUTE = re.compile(r'''\s([a-zA-Z][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))''')
OTHER_SITE = re.compile(r'^(?:[a-zA-Z][a-zA-Z0-9+.-]*:|//)')
# The attribute of each HTML element that links to a file.
HTML_LINKS = {'a': 'href', 'img': 'src'}


def slug(heading):
    """The anchor GitHub gives a heading: its text in lower case, punctuation dropped, spaces as hyphens."""
    text = re.sub(r'!?\[([^\]]*)\]\([^)]*\)', r'\1', heading)
    text = re.sub(r'<[^>]+>', '', text).replace('`', '')
    text = re.sub(r'(\*\*|__)(.+?)\1', r'\2', text)
    text = re.sub(r'(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])', r'\1', text)
    text = re.sub(r'(?<!\w)_(?!\s)(.+?)(?<!\s)_(?!\w)', r'\1', text)
    kept = [ch for ch in text.strip().lower()
            if ch in ' -_' or unicodedata.category(ch)[0] in 'LN' or unicodedata.category(ch) == 'Mn']
    return ''.join(kept).replace(' ', '-')


def outside_fences(text):
    """Each line not in a fenced block, with its number."""
    fenced = False
    for number, line in enumerate(text.splitlines(), 1):
        if FENCE.match(line):
            fenced = not fenced
        elif not fenced:
            yield number, line


def outside_code_spans(line):
    """The line without its code spans, whose text is shown as written and never read as a link or an id."""
    return re.sub(r'`[^`]*`', '', line)


def html_tags(line):
    """Each HTML tag in the line, as its name in lower case and its attributes, each value as written in any quotes or none."""
    for tag in TAG.finditer(line):
        yield tag.group(1).lower(), {
            attribute.group(1).lower(): next(value for value in attribute.groups()[1:] if value is not None)
            for attribute in ATTRIBUTE.finditer(tag.group(2))
        }


def written_ids(line):
    """The ids written in the line's HTML, and the names of its `<a>` elements."""
    for name, attributes in html_tags(line):
        if 'id' in attributes:
            yield attributes['id']
        if name == 'a' and 'name' in attributes:
            yield attributes['name']


def anchors(text):
    """The anchors a Markdown file has: one per heading, a repeat numbered -1, -2 as GitHub does, and any id written in it outside code."""
    found = set()
    seen = {}
    for _, line in outside_fences(text):
        heading = HEADING.match(line)
        if heading:
            base = slug(heading.group(1))
            found.add(f'{base}-{seen[base]}' if base in seen else base)
            seen[base] = seen.get(base, 0) + 1
        found.update(written_ids(outside_code_spans(line)))
    return found


def skip_title(line, i):
    """Where a link's title starting at `i` ends, in double or single quotes or in brackets, or None if it does not end."""
    close = ')' if line[i] == '(' else line[i]
    i += 1
    while i < len(line) and line[i] != close:
        i += 2 if line[i] == '\\' else 1
    return i + 1 if i < len(line) else None


def destination(line, i, end):
    """The destination of a link that starts at `i`, `<in angle brackets>` or not, when what follows it to `end` is a link's.

    `end` is what closes the link: `)` for an inline one, the end of the line
    for a reference. A destination not in angle brackets may hold brackets in
    pairs. A title, after a space, may follow it.
    """
    n = len(line)
    while i < n and line[i] in ' \t':
        i += 1
    if i < n and line[i] == '<':
        close = line.find('>', i + 1)
        if close < 0 or '<' in line[i + 1:close]:
            return None
        dest, i = line[i + 1:close], close + 1
    else:
        begin, depth = i, 0
        while i < n and line[i] not in ' \t':
            if line[i] == '\\':
                i += 1
            elif line[i] == '(':
                depth += 1
            elif line[i] == ')':
                if depth == 0:
                    break
                depth -= 1
            i += 1
        dest = line[begin:i]
    spaced = i < n and line[i] in ' \t'
    while i < n and line[i] in ' \t':
        i += 1
    if spaced and i < n and line[i] in '"\'(':
        i = skip_title(line, i)
        if i is None:
            return None
        while i < n and line[i] in ' \t':
            i += 1
    closed = i == n if end is None else (i < n and line[i] == end)
    return re.sub(r'\\([^\w\s])', r'\1', dest) if closed else None


def link_targets(line):
    """The destination of each inline link or picture, HTML link or picture, and reference in a line, in that order."""
    targets = []
    at = line.find('](')
    while at >= 0:
        dest = destination(line, at + 2, ')')
        if dest is not None:
            targets.append(dest)
        at = line.find('](', at + 2)
    for name, attributes in html_tags(line):
        if HTML_LINKS.get(name) in attributes:
            targets.append(attributes[HTML_LINKS[name]])
    reference = REFERENCE.match(line)
    if reference and not reference.group(1).startswith('^'):
        dest = destination(reference.group(2), 0, None)
        if dest is not None:
            targets.append(dest)
    return targets


def links(text):
    """Each target the text links to outside code and other sites, with its line number."""
    for number, line in outside_fences(text):
        for target in link_targets(outside_code_spans(line)):
            if target and not OTHER_SITE.match(target):
                yield number, target


def broken_links(root, names, tracked=None):
    """`path:line: target (why)` for each link in the named .md files under `root` that finds no file or no heading.

    With `tracked`, the paths under `root` git tracks, a file or folder must
    be one of those or hold one, and one on disk that is not is named as not
    tracked; without, it must be on disk.
    """
    read = {}

    def text_of(path):
        if path not in read:
            with open(path, encoding='utf-8') as f:
                read[path] = f.read()
        return read[path]

    folders = set() if tracked is None else {folder for name in tracked for folder in parents(os.path.dirname(name))}

    def under_root(path):
        relative = os.path.relpath(path, root)
        return '' if relative == '.' else relative

    def is_file(path):
        return os.path.isfile(path) if tracked is None else under_root(path) in tracked

    def is_folder(path):
        return os.path.isdir(path) if tracked is None else under_root(path) in folders

    broken = []
    for name in names:
        path = os.path.join(root, name)
        for number, target in links(text_of(path)):
            file_part, _, anchor = target.partition('#')
            file_part = unquote(file_part.partition('?')[0])
            if not file_part:
                dest = path
            elif file_part.startswith('/'):
                dest = os.path.normpath(os.path.join(root, file_part.lstrip('/')))
            else:
                dest = os.path.normpath(os.path.join(os.path.dirname(path), file_part))
            if not is_file(dest) and not (is_folder(dest) and not anchor):
                on_disk = os.path.isfile(dest) or (os.path.isdir(dest) and not anchor)
                why = 'not tracked' if on_disk else 'no such file'
            elif not anchor:
                continue
            elif not dest.endswith('.md'):
                why = 'not a Markdown file'
            elif unquote(anchor) not in anchors(text_of(dest)):
                why = 'no such heading'
            else:
                continue
            broken.append(f'{name}:{number}: {target} ({why})')
    return broken


def parents(folder):
    """A folder and each folder above it, up to the root's, written ''."""
    while folder:
        yield folder
        folder = os.path.dirname(folder)
    yield ''


def tracked_files():
    out = subprocess.run(['git', '-C', ROOT, 'ls-files', '-z'], capture_output=True, check=True).stdout.decode()
    return {name for name in out.split('\0') if name}


def tracked_markdown():
    return sorted(name for name in tracked_files() if name.endswith('.md') and os.path.isfile(os.path.join(ROOT, name)))


class Files:
    """A throwaway folder of Markdown files."""

    def __init__(self, files):
        self.dir = tempfile.TemporaryDirectory()
        for rel, text in files.items():
            path = os.path.join(self.dir.name, rel)
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, 'w', encoding='utf-8') as f:
                f.write(textwrap.dedent(text))

    def broken(self, *names):
        return broken_links(self.dir.name, names)

    def close(self):
        self.dir.cleanup()


class DocAnchors(unittest.TestCase):
    def test_every_link_in_a_tracked_markdown_file_finds_its_file_and_heading(self):
        self.assertEqual(broken_links(ROOT, tracked_markdown(), tracked=tracked_files()), [])

    def test_makes_anchors_as_github_does(self):
        for heading, anchor in [
            ('Campaign Export & Import', 'campaign-export--import'),
            ("Changing a member's role", 'changing-a-members-role'),
            ('5E (SRD 5.1)', '5e-srd-51'),
            ('Multi-Factor Authentication (MFA)', 'multi-factor-authentication-mfa'),
            ('The `docker compose` **files**', 'the-docker-compose-files'),
            ('See [the guide](GUIDE.md)', 'see-the-guide'),
            ('snake_case stays', 'snake_case-stays'),
        ]:
            with self.subTest(heading=heading):
                self.assertEqual(slug(heading), anchor)

    def test_numbers_a_repeated_heading_and_reads_a_written_id(self):
        found = anchors('# Notes\n\n## Notes\n\n### Notes\n\n<a id="kept-here"></a>\n')
        self.assertEqual(found, {'notes', 'notes-1', 'notes-2', 'kept-here'})

    def test_keeps_the_words_of_a_heading_written_as_code(self):
        self.assertEqual(anchors('## After editing `docker-compose.yml`\n'), {'after-editing-docker-composeyml'})

    def test_names_a_missing_heading_and_a_missing_file(self):
        files = Files({
            'docs/A.md': '''\
                # A
                See [B](B.md#second-part), [gone](B.md#third-part) and [lost](C.md#any).
                Back to [the top](#a) and [nowhere](#b).
                [ref]: B.md#first-part
                [bad ref]: B.md#fourth-part
            ''',
            'docs/B.md': '# First part\n\n## Second part\n',
        })
        self.addCleanup(files.close)
        self.assertEqual(files.broken('docs/A.md'), [
            'docs/A.md:2: B.md#third-part (no such heading)',
            'docs/A.md:2: C.md#any (no such file)',
            'docs/A.md:3: #b (no such heading)',
            'docs/A.md:5: B.md#fourth-part (no such heading)',
        ])

    def test_does_not_read_code_or_other_sites(self):
        files = Files({
            'A.md': '''\
                # A
                ```markdown
                [in a block](B.md#nothing)
                [in a block](gone.md)
                ```
                Inline `[in code](B.md#nothing)`, and [a site](https://example.com/page#part).
                Mail [me](mailto:someone@example.test), [a page](//example.com/gone.md) and [here](#a).
                A footnote[^1].
                [^1]: Footnote.
            ''',
            'B.md': '# B\n',
        })
        self.addCleanup(files.close)
        self.assertEqual(files.broken('A.md'), [])

    def test_names_a_missing_file_a_link_with_no_anchor_names(self):
        files = Files({
            'docs/A.md': '''\
                # A
                See [B](B.md), [the folder](../docs/), [the logo](../assets/logo.png) and [gone](C.md).
                A [lost picture](../assets/lost.png) and [a lost folder](../nowhere/).
                [ref]: B.md
                [bad ref]: D.md
                From the top: [B](/docs/B.md) and [lost](/docs/E.md), and [spaced](B%20two.md).
            ''',
            'docs/B.md': '# B\n',
            'docs/B two.md': '# B two\n',
            'assets/logo.png': 'not really a picture',
        })
        self.addCleanup(files.close)
        self.assertEqual(files.broken('docs/A.md'), [
            'docs/A.md:2: C.md (no such file)',
            'docs/A.md:3: ../assets/lost.png (no such file)',
            'docs/A.md:3: ../nowhere/ (no such file)',
            'docs/A.md:5: D.md (no such file)',
            'docs/A.md:6: /docs/E.md (no such file)',
        ])

    def test_reads_a_link_with_a_title_in_any_quotes_or_brackets(self):
        files = Files({
            'A.md': '''\
                # A
                [one](B.md#b "The B file"), [two](B.md#gone "The B file"), [three](B.md#lost 'The B file').
                [four](B.md#missing (The B file)) and [five](C.md "The C file").
                [ref]: B.md#absent 'The B file'
                [ref two]: B.md#away (The B file)
            ''',
            'B.md': '# B\n',
        })
        self.addCleanup(files.close)
        self.assertEqual(files.broken('A.md'), [
            'A.md:2: B.md#gone (no such heading)',
            'A.md:2: B.md#lost (no such heading)',
            'A.md:3: B.md#missing (no such heading)',
            'A.md:3: C.md (no such file)',
            'A.md:4: B.md#absent (no such heading)',
            'A.md:5: B.md#away (no such heading)',
        ])

    def test_reads_a_destination_in_angle_brackets(self):
        files = Files({
            'A.md': '''\
                # A
                [one](<B two.md#b-two>), [two](<B two.md#gone> "t") and [three](<C two.md>).
                [ref]: <B two.md#absent>
                A path with brackets in it: [four](B_(old).md) and [five](B_(new).md).
            ''',
            'B two.md': '# B two\n',
            'B_(old).md': '# Old\n',
        })
        self.addCleanup(files.close)
        self.assertEqual(files.broken('A.md'), [
            'A.md:2: B two.md#gone (no such heading)',
            'A.md:2: C two.md (no such file)',
            'A.md:3: B two.md#absent (no such heading)',
            'A.md:4: B_(new).md (no such file)',
        ])

    def test_reads_html_links_and_anchors(self):
        files = Files({
            'A.md': '''\
                # A
                <a href="B.md#double">one</a> <a href='B.md#single'>two</a> <a href=B.md#bare>three</a>
                <a href="B.md#gone">four</a> <a href="C.md">five</a> <img src="logo.png" alt=""> <img src="lost.png" alt="">
                <a href="https://example.com/x.md#y">a site</a> <a href='B.md#away'>six</a> <a class="x" href=D.md>seven</a>
            ''',
            'B.md': '''\
                # B
                <a id="double"></a>
                <a name='single'></a>
                <a id=bare></a>
            ''',
            'logo.png': 'not really a picture',
        })
        self.addCleanup(files.close)
        self.assertEqual(files.broken('A.md'), [
            'A.md:3: B.md#gone (no such heading)',
            'A.md:3: C.md (no such file)',
            'A.md:3: lost.png (no such file)',
            'A.md:4: B.md#away (no such heading)',
            'A.md:4: D.md (no such file)',
        ])

    def test_reads_a_written_id_in_any_quotes(self):
        self.assertEqual(anchors('<a id="one"></a>\n<a name=\'two\'></a>\n<a id=three></a>\n<span id="four"></span>\n'),
                         {'one', 'two', 'three', 'four'})

    def test_an_id_written_in_code_is_no_anchor(self):
        # An example of the markup, in a code span or a fenced block, is not on the page.
        text = 'Keep a link with `<a id="kept"></a>` above it.\n```html\n<a id="fenced"></a>\n```\n## After editing `docker-compose.yml`\n<a id="real"></a>\n'
        self.assertEqual(anchors(text), {'after-editing-docker-composeyml', 'real'})
        files = Files({'A.md': text + '[one](#kept), [two](#fenced) and [three](#real)\n'})
        self.addCleanup(files.close)
        self.assertEqual(files.broken('A.md'), ['A.md:7: #kept (no such heading)', 'A.md:7: #fenced (no such heading)'])

    def test_a_file_must_be_tracked_where_the_tracked_files_are_given(self):
        # A file on disk that git does not track yet is named as such.
        files = Files({'A.md': '# A\n[B](B.md), [notes](notes/), [C](C.md#c) and [D](D.md)\n', 'B.md': '# B\n', 'C.md': '# C\n', 'notes/x.txt': 'x'})
        self.addCleanup(files.close)
        self.assertEqual(broken_links(files.dir.name, ['A.md'], tracked={'A.md', 'B.md'}), [
            'A.md:2: notes/ (not tracked)',
            'A.md:2: C.md#c (not tracked)',
            'A.md:2: D.md (no such file)',
        ])

    def test_names_an_anchor_into_a_file_that_is_not_markdown(self):
        files = Files({'A.md': '[the spec](spec.yaml#paths)\n', 'spec.yaml': 'paths: {}\n'})
        self.addCleanup(files.close)
        self.assertEqual(files.broken('A.md'), ['A.md:1: spec.yaml#paths (not a Markdown file)'])


if __name__ == '__main__':
    unittest.main()
