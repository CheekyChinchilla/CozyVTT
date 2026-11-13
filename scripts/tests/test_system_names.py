"""Tracked text calls each game system by CozyVTT's own name for it.

CozyVTT's own names for its game systems are 5E (SRD 5.1), Fantasy d20 (ORC)
and Horror d100. This check holds every tracked file to that naming
convention: no line names a game, its publisher, its setting or its books.
The patterns are kept encoded so this file names nothing either. The licence
attribution lines, which name their licensors, are listed in
EXEMPT_NOTICE_LINES.

A name of several words matches with spaces, hyphens or underscores between
them, as a file name joins them. The publishers' names, their games' and the
fantasy setting's world match in any letter case, except inside an
identifier or a web address: joined to a letter or an underscore, or after a
full stop or a slash. So the stored keys this version keeps, and the
licensors' addresses in the notices, are not counted. The games'
short tags count in any letter case too, as an id or a word writes them:
whole, outside a web address, and the horror game's also at the start of an
identifier, joined to a capital.

The game system values versions before 1.7.0 stored count in any letter case
and with or without their underscores. They are written only where old
values are read (STORED_NAMES_ALLOWED): the backend's legacy folder, the
browser's copy of its alias table, and the migrations. The changelog is read
whole, and may quote one in a code span, as an entry does that says what a
screen or a script showed at the time.

No tracked path names a game either, and none writes the GM's role as DM,
but the page at the GM guide's old address. A path is read as words, split
also where a file name joins them as an identifier does.
"""

import os
import re
import subprocess
import unittest

from test_gm_wording import CODE_SPAN, POINTER as GUIDE_POINTER

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

GROUPS = {
    'fifth': re.compile(bytes.fromhex('4426283f3a616d703b293f447c5c62446e445c627c44756e67656f6e735b5c735f2d5d2b283f3a26283f3a616d703b293f7c616e64295b5c735f2d5d2b447261676f6e737c57697a617264735b5c735f2d5d2b6f665b5c735f2d5d2b7468655b5c735f2d5d2b436f6173747c5c62576f74435c627c5c625374726168645c627c5c625068616e64656c7665725c627c5c624c6f73745b5c735f2d5d2b4d696e65733f5c627c283f693a5c62706c61796572283f3a5b27e280995d737c735b27e280995d3f293f5b5c735f2d5d2b68616e64626f6f6b5c627c5c626d6f6e737465725b5c735f2d5d2b6d616e75616c5c627c5c6264756e67656f6e5b5c735f2d5d2b6d6173746572283f3a5b27e280995d737c735b27e280995d3f293f5b5c735f2d5d2b67756964655c62297c5c624261726f7669615c627c5c62486172706572735c627c417263616e655b5c735f2d5d2b42726f74686572686f6f647c283f693a5c6264756e67656f6e5b5c735f2d5d2b6d6173746572733f5c62297c283f693a283f3c215b5c772e2f5d29646e64283f215b412d5a612d7a302d395f5d2929').decode()),
    'fantasy': re.compile(bytes.fromhex('5c625061746866696e6465725c627c5c625046325b65455d3f5c627c5c625061697a6f5c627c5c62476f6c6172696f6e5c627c5c62416273616c6f6d5c627c5c62546f7261675c627c5c624e65746879735c627c41726368697665735b5c735f2d5d2b6f665b5c735f2d5d2b4e65746879737c5c62436f72655b5c735f2d5d2b52756c65626f6f6b5c627c5c62506c617965725b5c735f2d5d2b436f72655c627c5c62474d5b5c735f2d5d2b436f72655c627c5c624d6f6e737465725b5c735f2d5d2b436f72655c627c5c624c6f73745b5c735f2d5d2b4f6d656e735c627c5c624d616761616d6279615c627c5c624d77616e67695b5c735f2d5d2b457870616e73655c627c283f693a283f3c215b5c772e2f5d29283f3a7061746866696e6465727c7061697a6f7c676f6c6172696f6e29283f215b412d5a612d7a5f5d29297c5c625365656c61685c627c5c6256616c65726f735c627c5c62457a72656e5c627c5c624d6572697369656c5c627c5c62486172736b5c627c5c6253656f6e695c627c5c6246656979615c627c283f693a5c626e616b7564616d615c62297c283f693a283f3c215b5c772e2f5d29706632653f283f215b412d5a612d7a302d395f5d2929').decode()),
    'horror': re.compile(bytes.fromhex('43616c6c5b5c735f2d5d2b6f665b5c735f2d5d2b437468756c68757c5c62437468756c68755c627c5c62436f435c627c5c624368616f7369756d5c627c5c624d7974686f735c627c5c624d69736b61746f6e69635c627c5c6241726b68616d5c627c5c624e7961726c6174686f7465705c627c456c6465725b5c735f2d5d2b5369676e7c59656c6c6f775b5c735f2d5d2b5369676e7c5c62566f6f726973685c627c5c624c6f76656372616674283f3a69616e293f5c627c5c624e6563726f6e6f6d69636f6e5c627c5c6253686f67676f7468733f5c627c5c62596f672d536f74686f74685c627c5c62417a6174686f74685c627c5c624861737475725c627c5c62525b27e280995d6c7965685c627c5c62496e6e736d6f7574685c627c5c62446565705b5c735f2d5d2b4f6e65733f5c627c283f693a5c626b6565706572283f3a5b27e280995d737c735b27e280995d3f293f5b5c735f2d5d2b72756c65626f6f6b5c627c5c62696e76657374696761746f72283f3a5b27e280995d737c735b27e280995d3f293f5b5c735f2d5d2b68616e64626f6f6b5c627c5c626d616c6c6575735b5c735f2d5d2b6d6f6e7374726f72756d5c627c5c626772616e645b5c735f2d5d2b6772696d6f6972655c62297c4f726e655b5c735f2d5d2b4c6962726172797c5c6257686174656c6579733f5c627c5c6244725c2e3f5b5c735f2d5d2b41726d69746167655c627c5c6248656e72795b5c735f2d5d2b41726d69746167655c627c5c6252616e646f6c70685b5c735f2d5d2b4361727465725c627c283f693a283f3c215b5c772e2f5d29283f3a637468756c68757c6368616f7369756d29283f215b412d5a612d7a5f5d29297c5c626d7974686f73283f215b612d7a5d297c283f3c3d5b612d7a302d395d29283f3c21637468756c687529283f3c217370656c6c73416e64294d7974686f737c283f3c215b412d5a612d7a5d294d5954484f537c283f3c3d5b612d7a302d395d294b6565706572283f3d5b412d5a5d7c5c62297c283f693a5c626b6565706572283f3a5b27e280995d73293f5b5c735f2d5d2a283f3a6e6f7465737c6f6e6c7929297c283f693a283f3c215b5c772e2f5d29636f63283f215b412d5a612d7a302d395f5d29297c283f3c215b412d5a612d7a302d395f5d29636f63283f3d5b412d5a5d29').decode()),
    'retired': re.compile(bytes.fromhex('283f6929736861646f7772756e7c5c625352365c627c5c62737236').decode()),
    'stored': re.compile(bytes.fromhex('283f693a283f3c215b412d5a612d7a302d395d29283f3a646e645f3f35657c7061746866696e6465725f3f32657c63616c6c5f3f6f665f3f637468756c68755f3f376529283f215b412d5a612d7a302d395d2929').decode()),
}

# The attribution texts the licences ask for, which must name their licensors:
# the SRD 5.1's sentence, the two Fantasy d20 books' credits and the d100
# rules' credit. Encoded, like the patterns.
SRD_SENTENCE = bytes.fromhex(
    '5468697320776f726b20696e636c75646573206d6174657269616c2074616b656e2066726f6d207468652053797374656d205265666572656e636520446f63756d656e7420352e312028e2809c53524420352e31e2809d292062792057697a61726473206f662074686520436f617374204c4c4320616e6420617661696c61626c652061742068747470733a2f2f646e642e77697a617264732e636f6d2f7265736f75726365732f73797374656d732d7265666572656e63652d646f63756d656e742e205468652053524420352e31206973206c6963656e73656420756e6465722074686520437265617469766520436f6d6d6f6e73204174747269627574696f6e20342e3020496e7465726e6174696f6e616c204c6963656e736520617661696c61626c652061742068747470733a2f2f6372656174697665636f6d6d6f6e732e6f72672f6c6963656e7365732f62792f342e302f6c6567616c636f64652e'
).decode()
FANTASY_PLAYER_BOOK = bytes.fromhex(
    '5061746866696e64657220506c6179657220436f726520c2a92032303233205061697a6f20496e632e2c2044657369676e6564206279204c6f67616e20426f6e6e65722c204a61736f6e2042756c6d61686e2c205374657068656e205261646e65792d4d61634661726c616e642c20616e64204d61726b20536569667465722e20417574686f72733a20416c6578616e64657220417567756e61732c204b6174652042616b65722c204c6f67616e20426f6e6e65722c204a61736f6e2042756c6d61686e2c204361726c6f7320436162726572612c2043616c64657220436144617669642c204a616d657320436173652c20456c65616e6f7220466572726f6e2c2053746576656e2048616d6d6f6e642c204a6f616e20486f6e672c2056616e6573736120486f736b696e732c204a616d6573204a61636f62732c204a656e6e79204a61727a6162736b692c204572696b204b656974682c2044757374696e204b6e696768742c204c797a204c696464656c6c2c204c756973204c6f7a612c205061746368656e204d6f7274696d65722c2044656e6e6973204d756c646f6f6e2c205374657068656e205261646e65792d4d61634661726c616e642c204d696b6861696c2052656b756e2c204461766964204e2e20526f73732c204d69636861656c2053617972652c204d61726b20536569667465722c204b656e647261204c656967682053706565646c696e672c204d61726b2054686f6d70736f6e2c20436c61726b2056616c656e74696e652c20416e647265772057686974652c204c616e646f6e2057696e6b6c65722c20616e64204c696e6461205a617961732d50616c6d6572'
).decode()
FANTASY_GM_BOOK = bytes.fromhex(
    '5061746866696e64657220474d20436f726520c2a92032303233205061697a6f20496e632e2c2044657369676e6564206279204c6f67616e20426f6e6e657220616e64204d61726b20536569667465722e20417574686f72733a20416d6972616c69204174746172204f6c796165652c204c6f67616e20426f6e6e65722c20437265696768746f6e2042726f616468757273742c204a61736f6e2042756c6d61686e2c204a616d657320436173652c204a65737365204465636b65722c20456c65616e6f7220466572726f6e2c204661626279204761727a61204d6172726f7175c3ad6e2c204a61796d2047617465732c204d61747468657720476f65747a2c204a616d6573204a61636f62732c20427269616e20522e204a616d65732c204a656e6e79204a61727a6162736b692c2044757374696e204b6e696768742c204a61736f6e204c654d61697472652c204c797a204c696464656c6c2c204c756973204c6f7a612c20526f6e204c756e6465656e2c205374657068656e205261646e65792d4d61634661726c616e642c204461766964204e2e20526f73732c204d69636861656c2053617972652c204d61726b20536569667465722c204f77656e204b2e432e205374657068656e732c20416d62657220537465776172742c20436c61726b2056616c656e74696e652c204c616e646f6e2057696e6b6c65722c20616e64204c696e6461205a617961732d50616c6d6572'
).decode()
D100_RULES = bytes.fromhex(
    '22426173696320526f6c65706c6179696e673a20556e6976657273616c2047616d6520456e67696e652c2220636f7079726967687420c2a92032303234204368616f7369756d20496e632e2c206279204a61736f6e20447572616c6c20616e642053746576652050657272696e2e'
).decode()
ATTRIBUTIONS = (SRD_SENTENCE, FANTASY_PLAYER_BOOK, FANTASY_GM_BOOK, D100_RULES)

# The two ORC Notices, which give each licensor's web address. The patterns
# skip a name inside an address, so these lines would pass unlisted; they are
# listed so that the exception is written down. Read from the notices file,
# where a check of its own holds their wording.
ORC_NOTICE_START = 'This product is licensed under the ORC License '


def orc_notices():
    with open(os.path.join(ROOT, 'GAME_CONTENT_NOTICES.md'), encoding='utf-8') as handle:
        return tuple(line.rstrip('\n') for line in handle if line.startswith(ORC_NOTICE_START))


ORC_NOTICES = orc_notices()

# Path to the exact lines allowed to keep a name: each attribution text as the
# file writes it, and nothing more on the line.
EXEMPT_NOTICE_LINES = {
    'GAME_CONTENT_NOTICES.md': set(ATTRIBUTIONS) | set(ORC_NOTICES),
    'THIRD_PARTY_NOTICES.txt': {f'  {text}' for text in ATTRIBUTIONS + ORC_NOTICES},
    'frontend/src/constants/gameContentNotices.ts': {f'  `{SRD_SENTENCE}`;'}
    | {f'      `{text}`,' for text in (FANTASY_PLAYER_BOOK, FANTASY_GM_BOOK, D100_RULES) + ORC_NOTICES},
    # The check that the notices carry the SRD's sentence holds it.
    'backend/src/__tests__/documentedFacts.test.ts': {f"    '{SRD_SENTENCE}';"},
}

# Files never read: lockfiles carry package names only.
SKIPPED_SUFFIX = 'package-lock.json'
# Released API notes, kept as written.
SKIPPED_FILES = {
    'docs/api-changes/1.5.1.md',
    'docs/api-changes/1.5.2.md',
    'docs/api-changes/1.5.3.md',
    'docs/api-changes/1.5.4.md',
    'docs/api-changes/1.6.0.md',
}
# Skipped for the retired group only: the migration that created the enum.
RETIRED_ONLY_SKIPPED = {
    'backend/prisma/migrations/20260220041038_add_game_system_support/migration.sql',
}
# Paths not read for names: a migration folder is never renamed.
MIGRATIONS = 'backend/prisma/migrations/'
# The only places the stored group's values may be written: the backend's
# folder of what reads old values, the browser's copy of its alias table, and
# the migrations, which renamed them.
STORED_NAMES_ALLOWED = ('backend/src/legacy/', 'frontend/src/legacy/gameSystemAliases.ts', MIGRATIONS)
# Where the stored group's values may be quoted in a code span and nowhere
# else: an entry of the time says what a screen or a script showed.
STORED_NAMES_QUOTED = 'CHANGELOG.md'
# The role's older short name, as a word of a path. The app says GM.
ROLE_IN_A_PATH = re.compile(r'\bDM\b')


def stored_names_allowed(name):
    """Whether the stored group's values may be written in the file at `name`."""
    return name == STORED_NAMES_ALLOWED[1] or name.startswith((STORED_NAMES_ALLOWED[0], STORED_NAMES_ALLOWED[2]))


def read_for(group, name, line):
    """The part of the line at `name` that is read for `group`'s names."""
    if group == 'stored' and name == STORED_NAMES_QUOTED:
        return CODE_SPAN.sub('', line)
    return line


def tracked_files():
    out = subprocess.run(['git', '-C', ROOT, 'ls-files', '-z'], capture_output=True, check=True).stdout.decode()
    return [name for name in out.split('\0') if name]


def lines_naming(group):
    """Each tracked text file's lines that name `group`, as `path:line`."""
    pattern = GROUPS[group]
    found = []
    for name in tracked_files():
        if name.endswith(SKIPPED_SUFFIX) or name in SKIPPED_FILES:
            continue
        if group == 'retired' and name in RETIRED_ONLY_SKIPPED:
            continue
        if group == 'stored' and stored_names_allowed(name):
            continue
        try:
            with open(os.path.join(ROOT, name), encoding='utf-8') as f:
                text = f.read()
        except (UnicodeDecodeError, FileNotFoundError, IsADirectoryError):
            continue
        exempt = EXEMPT_NOTICE_LINES.get(name, set())
        for number, line in enumerate(text.splitlines(), 1):
            if line in exempt:
                continue
            if pattern.search(read_for(group, name, line)):
                found.append(f'{name}:{number}')
    return found


# Where an identifier joins two words: a small letter before a capital, a run
# of capitals before a capitalised word, and a letter before a digit.
WORD_JOINS = (r'(?<=[a-z])(?=[A-Z])', r'(?<=[A-Z])(?=[A-Z][a-z])', r'(?<=[A-Za-z])(?=[0-9])')


def path_readings(name):
    """The ways a path reads as words.

    `_` is a word character, so separators become spaces. A file name joins
    its words as an identifier does, so the path is also split at every
    combination of WORD_JOINS: a name spelt with a capital inside it, such as
    the one a run of capitals ends, reads as a word only when some joins are
    left whole.
    """
    readings = {re.sub(r'[_/-]', ' ', name)}
    for join in WORD_JOINS:
        readings |= {re.sub(join, ' ', reading) for reading in readings}
    return readings


def path_names(name, patterns):
    """Whether any of `patterns` finds a name in a reading of the path, in any letter case."""
    return any(re.search(p.pattern, reading, p.flags | re.I) for p in patterns for reading in path_readings(name))


def paths_naming(patterns):
    """Tracked paths outside the migrations that name what `patterns` find."""
    return [name for name in tracked_files() if not name.startswith(MIGRATIONS) and path_names(name, patterns)]


NOT_A_SYSTEM_NAME = "not one of CozyVTT's own names for its game systems"


class SystemNames(unittest.TestCase):
    def test_no_line_names_a_group(self):
        for group in GROUPS:
            with self.subTest(group=group):
                self.assertEqual(lines_naming(group), [], f'these lines use a name that is {NOT_A_SYSTEM_NAME}')

    def test_no_path_names_a_game(self):
        self.assertEqual(paths_naming(GROUPS.values()), [], f'these paths use a name that is {NOT_A_SYSTEM_NAME}')

    def test_no_path_names_the_role_dm(self):
        # The page at the GM guide's old address keeps its name, so a link to it still opens.
        self.assertEqual([name for name in paths_naming([ROLE_IN_A_PATH]) if name != GUIDE_POINTER], [], 'these paths do not call the game master the GM')

    def test_a_path_is_read_as_the_words_its_names_join(self):
        # Folders and file stems, each joining a game's name to its edition or
        # to the next word a different way. Encoded, like the patterns.
        for sample in [
            '636f6d706f6e656e74732f6368617261637465722d7368656574732f7061746866696e64657232652f',
            '5061746866696e6465723265436861726163746572456469746f722e747378',
            '72756c65732e63616c6c4f66437468756c687537652e746573742e7473',
            '636f6d706f6e656e74732f6368617261637465722d7368656574732f63616c6c2d6f662d637468756c68752d37652f646f6467652e7473',
            '636f6e7374616e74732f636f63536b696c6c4e616d65732e7473',
            '5066326550726f66696369656e6379456469746f722e747378',
            '72756c65732f646e6435652e7473',
            '446e64356553746174426c6f636b2e747378',
            '646e6435652d74656d706c617465732e7473',
            '446e443565436861726163746572566965772e747378',
            '7368656574732f5046324553746174426c6f636b2e747378',
            '446e4453686565742e747378',
        ]:
            with self.subTest(sample=sample):
                self.assertTrue(path_names(bytes.fromhex(sample).decode(), GROUPS.values()))
        for sample in ['campaign/DmFogControls.tsx', 'utils/dmTokenMenu.ts', 'preparedMapsDmOnly.e2e.test.ts', 'docs/DM_GUIDE.md',
                       'campaign/DMToolPanel.tsx', 'utils/requireDMOrPlayer.ts']:
            with self.subTest(sample=sample):
                self.assertTrue(path_names(sample, [ROLE_IN_A_PATH]))
        # The systems' own names, the GM's, and paths that hold the letters of none.
        for sample in ['assets/AssetUploadModal.tsx', 'hooks/useReducedMotion.ts', 'admin/AdminPage.tsx',
                       'Examples/5e_character.json', 'storedSheets/5e.json', 'fantasy-d20/FantasyD20CharacterView.tsx',
                       'rules/horrorD100.ts', 'campaign/GmFogControls.tsx']:
            with self.subTest(sample=sample):
                self.assertFalse(path_names(sample, [*GROUPS.values(), ROLE_IN_A_PATH]))

    def test_the_guide_pointer_is_a_file_that_exists(self):
        self.assertIn(GUIDE_POINTER, set(tracked_files()))

    def test_the_exemptions_name_files_that_exist(self):
        tracked = set(tracked_files())
        for name in EXEMPT_NOTICE_LINES:
            self.assertIn(name, tracked)

    def test_each_exemption_is_a_line_its_file_has(self):
        # An exemption is a line its file holds, so the list stays as short
        # as the notices.
        for name, lines in EXEMPT_NOTICE_LINES.items():
            with open(os.path.join(ROOT, name), encoding='utf-8') as f:
                held = set(f.read().splitlines())
            for line in lines:
                with self.subTest(name=name, line=line[:60]):
                    self.assertTrue(line in held, f'{name} has no line {line[:60]!r}...')

    def test_the_values_older_versions_stored_count(self):
        # The game system values versions before 1.7.0 stored, as the enum,
        # a quoted value, a squashed command-line spelling or part of a longer
        # identifier writes them. Encoded, like the patterns.
        for sample in ['444e445f3545', '646e645f3565', '646e643565', '5041544846494e4445525f3245', '7061746866696e6465725f3265',
                       '43414c4c5f4f465f435448554c48555f3745', '63616c6c6f66637468756c68753765', '47616d6553797374656d2e444e445f3545',
                       '785f444e445f35455f79']:
            with self.subTest(sample=sample):
                self.assertRegex(bytes.fromhex(sample).decode(), GROUPS['stored'])
        # The values since 1.7.0, and words that hold some of the letters.
        for sample in ['FIFTH_EDITION', 'FANTASY_D20', 'HORROR_D100', 'fifthedition', 'GameSystem.HORROR_D100', 'DnD5Encounter', 'callof7e']:
            for group, pattern in GROUPS.items():
                with self.subTest(group=group, sample=sample):
                    self.assertNotRegex(sample, pattern)

    def test_the_values_older_versions_stored_are_allowed_only_where_old_values_are_read(self):
        for name in ['backend/src/legacy/gameSystemAliases.ts', 'backend/src/legacy/__tests__/storedNamesMigration.test.ts',
                     'frontend/src/legacy/gameSystemAliases.ts', 'backend/prisma/migrations/20261112013825_name_systems_and_gm_role/migration.sql']:
            with self.subTest(name=name):
                self.assertTrue(stored_names_allowed(name))
        for name in ['frontend/src/legacy/other.ts', 'backend/src/legacyThing.ts', 'docs/legacy/x.md', 'backend/src/routes/legacy.ts',
                     'frontend/src/utils/character-export.ts', 'backend/prisma/schema.prisma']:
            with self.subTest(name=name):
                self.assertFalse(stored_names_allowed(name))

    def test_the_changelog_may_quote_a_value_older_versions_stored_in_a_code_span(self):
        # Encoded, like the patterns.
        value = bytes.fromhex('444e445f3545').decode()
        quoted = f'showed a code such as `{value}`.'
        self.assertNotRegex(read_for('stored', 'CHANGELOG.md', quoted), GROUPS['stored'])
        # Outside a code span it counts, and so does a quoted one in any other file.
        self.assertRegex(read_for('stored', 'CHANGELOG.md', f'showed {value}.'), GROUPS['stored'])
        self.assertRegex(read_for('stored', 'README.md', quoted), GROUPS['stored'])
        # A game's name counts in a code span too.
        named = bytes.fromhex('60646e642d74656d706c617465732e747360').decode()
        self.assertRegex(read_for('fifth', 'CHANGELOG.md', named), GROUPS['fifth'])

    def test_the_places_allowed_the_values_older_versions_stored_exist(self):
        tracked = set(tracked_files())
        self.assertIn(STORED_NAMES_ALLOWED[1], tracked)
        self.assertIn(STORED_NAMES_QUOTED, tracked)
        for folder in (STORED_NAMES_ALLOWED[0], STORED_NAMES_ALLOWED[2]):
            with self.subTest(folder=folder):
                self.assertTrue(any(name.startswith(folder) for name in tracked))

    def test_a_name_written_as_an_html_entity_still_counts(self):
        # JSX text spells an ampersand `&amp;`. Encoded, like the patterns.
        self.assertRegex(bytes.fromhex('4426616d703b44203565').decode(), GROUPS['fifth'])

    def test_adventure_and_book_titles_count(self):
        # One sample for each way the fifth group's adventure and book titles
        # are written, the apostrophe straight, curly or left out. Encoded,
        # like the patterns.
        samples = [
            '5068616e64656c766572',
            '4c6f7374204d696e65',
            '4c6f7374204d696e6573',
            '506c6179657227732048616e64626f6f6b',
            '506c61796572732048616e64626f6f6b',
            '506c617965722048616e64626f6f6b',
            '706c6179657273272068616e64626f6f6b',
            '506c61796572e28099732048616e64626f6f6b',
            '4d6f6e73746572204d616e75616c',
            '6d6f6e73746572206d616e75616c',
            '44756e67656f6e204d61737465722773204775696465',
            '44756e67656f6e204d617374657273204775696465',
            '44756e67656f6e204d6173746572204775696465',
            '64756e67656f6e206d6173746572e2809973206775696465',
        ]
        for sample in samples:
            with self.subTest(sample=sample):
                self.assertRegex(bytes.fromhex(sample).decode(), GROUPS['fifth'])

    def test_fantasy_book_titles_count(self):
        # The three-action fantasy game's book titles, matched with their
        # capitals only, so the words in ordinary prose do not count. Encoded,
        # like the patterns.
        samples = [
            '436f72652052756c65626f6f6b',
            '506c6179657220436f7265',
            '474d20436f7265',
            '4d6f6e7374657220436f7265',
            '4c6f7374204f6d656e73',
        ]
        for sample in samples:
            with self.subTest(sample=sample):
                self.assertRegex(bytes.fromhex(sample).decode(), GROUPS['fantasy'])
        for sample in ['636f72652072756c65626f6f6b', '706c6179657220636f7265']:
            with self.subTest(sample=sample):
                self.assertNotRegex(bytes.fromhex(sample).decode(), GROUPS['fantasy'])

    def test_horror_book_titles_and_fiction_names_count(self):
        # The percentile horror game's book titles, matched in any letter case
        # with the possessive written or left out, and the names and symbols
        # of its fiction, matched with their capitals only. Encoded, like the
        # patterns.
        samples = [
            '4b65657065722052756c65626f6f6b',
            '4b656570657227732052756c65626f6f6b',
            '6b6565706572732072756c65626f6f6b',
            '4b6565706572e28099732052756c65626f6f6b',
            '496e76657374696761746f722048616e64626f6f6b',
            '496e76657374696761746f7227732048616e64626f6f6b',
            '496e76657374696761746f7273272048616e64626f6f6b',
            '696e76657374696761746f72732068616e64626f6f6b',
            '4d616c6c657573204d6f6e7374726f72756d',
            '6d616c6c657573206d6f6e7374726f72756d',
            '4772616e64204772696d6f697265',
            '6772616e64206772696d6f697265',
            '4e7961726c6174686f746570',
            '456c646572205369676e',
            '59656c6c6f77205369676e',
            '566f6f72697368',
            '4c6f76656372616674',
            '4c6f7665637261667469616e',
            '4e6563726f6e6f6d69636f6e',
            '53686f67676f7468',
            '53686f67676f746873',
            '596f672d536f74686f7468',
            '417a6174686f7468',
            '486173747572',
            '52276c796568',
            '52e280996c796568',
            '496e6e736d6f757468',
            '44656570204f6e65',
            '44656570204f6e6573',
        ]
        for sample in samples:
            with self.subTest(sample=sample):
                self.assertRegex(bytes.fromhex(sample).decode(), GROUPS['horror'])
        for sample in ['656c646572207369676e', '79656c6c6f77207369676e', '686173747572', '64656570206f6e65']:
            with self.subTest(sample=sample):
                self.assertNotRegex(bytes.fromhex(sample).decode(), GROUPS['horror'])

    def test_setting_names_count(self):
        # A gothic domain, a secret society and a wizards' brotherhood of the
        # fifth edition game's settings; the fantasy game's magic school and
        # jungle region; a library, a family and two people of the horror
        # fiction. Matched with their capitals only, and a person or a region by
        # the whole name, so the ordinary words and a bare surname do not count.
        # Encoded, like the patterns.
        samples = {
            'fifth': ['4261726f766961', '48617270657273', '417263616e652042726f74686572686f6f64'],
            'fantasy': ['4d616761616d627961', '4d77616e676920457870616e7365'],
            'horror': [
                '4f726e65204c696272617279', '57686174656c6579', '57686174656c657973', '44722e2041726d6974616765',
                '44722041726d6974616765', '48656e72792041726d6974616765', '52616e646f6c706820436172746572',
            ],
        }
        for group, encoded in samples.items():
            for sample in encoded:
                with self.subTest(group=group, sample=sample):
                    self.assertRegex(bytes.fromhex(sample).decode(), GROUPS[group])
        ordinary = {
            'fifth': ['68617270657273', '617263616e652062726f74686572686f6f64'],
            'fantasy': ['4d77616e6769'],
            'horror': ['61726d6974616765', '41726d6974616765', '6f726e65206c696272617279'],
        }
        for group, encoded in ordinary.items():
            for sample in encoded:
                with self.subTest(group=group, sample=sample):
                    self.assertNotRegex(bytes.fromhex(sample).decode(), GROUPS[group])

    def test_multi_word_names_count_joined_by_hyphens_or_underscores(self):
        # A file name or an identifier joins the words with a hyphen or an
        # underscore. Encoded, like the patterns.
        samples = {
            'fifth': ['706c61796572732d68616e64626f6f6b2e706466', '6d6f6e737465725f6d616e75616c', '57697a617264732d6f662d7468652d436f617374', '44756e67656f6e735f616e645f447261676f6e73', '4c6f73742d4d696e6573', '64756e67656f6e2d6d61737465722d6775696465'],
            'fantasy': ['506c617965722d436f7265', '474d5f436f7265', '41726368697665732d6f662d4e6574687973', '4c6f73745f4f6d656e73'],
            'horror': ['43616c6c5f6f665f437468756c6875', '6b65657065722d72756c65626f6f6b', '446565705f4f6e6573', '6772616e642d6772696d6f697265'],
        }
        for group, encoded in samples.items():
            for sample in encoded:
                with self.subTest(group=group, sample=sample):
                    self.assertRegex(bytes.fromhex(sample).decode(), GROUPS[group])

    def test_unambiguous_names_count_in_any_letter_case(self):
        # The publishers' names, their games' and the fantasy setting's world,
        # written as words in any letter case. Encoded, like the patterns.
        samples = {
            'fantasy': ['7061746866696e646572', '5041495a4f', '676f6c6172696f6e', '5061746866696e6465722e', '287061697a6f29'],
            'horror': ['637468756c6875', '4348414f5349554d', '437468756c68752c'],
        }
        for group, encoded in samples.items():
            for sample in encoded:
                with self.subTest(group=group, sample=sample):
                    self.assertRegex(bytes.fromhex(sample).decode(), GROUPS[group])

    def test_identifiers_and_addresses_are_not_names(self):
        # The stored keys this version keeps, and the licensors' web
        # addresses in the notices. Encoded, like the patterns.
        for sample in ['637468756c68754d7974686f73', '7370656c6c73416e644d7974686f73', '68747470733a2f2f7061697a6f2e636f6d2f6f72636c6963656e7365', '7777772e6368616f7369756d2e636f6d2f6f72636c6963656e7365']:
            for group, pattern in GROUPS.items():
                with self.subTest(group=group, sample=sample):
                    self.assertNotRegex(bytes.fromhex(sample).decode(), pattern)

    def test_short_tags_count_in_small_letters(self):
        # The games' short tags as an id, a file name or a word writes them in
        # small letters: each whole, and the horror one joined to a capital as
        # an identifier starts with it too. Encoded, like the patterns.
        samples = {
            'fifth': ['646e64', '63616d702d646e64', '27646e6427', '444e442063616d706169676e'],
            'fantasy': ['70663265', '706632', '287066326529'],
            'horror': ['636f63', '27636f6327', '636f63536b696c6c4e616d6573'],
        }
        for group, encoded in samples.items():
            for sample in encoded:
                with self.subTest(group=group, sample=sample):
                    self.assertRegex(bytes.fromhex(sample).decode(), GROUPS[group])
        # Ordinary words that hold the letters, and the SRD's web address in
        # its notice.
        ordinary = ['cocoa', 'Coconut', 'peacock', 'hiccough', 'Cocktail', 'pf', 'handy']
        kept = ['68747470733a2f2f646e642e77697a617264732e636f6d2f7265736f7572636573']
        for sample in ordinary + [bytes.fromhex(sample).decode() for sample in kept]:
            for group, pattern in GROUPS.items():
                with self.subTest(group=group, sample=sample):
                    self.assertNotRegex(sample, pattern)

    def test_the_horror_games_lore_word_and_role_count_in_code_names(self):
        # The lore word as an identifier starts or joins it, and the game's
        # name for the GM where code names it: joined after a word, or naming
        # the GM's notes or the field only the GM reads. The stored keys that
        # end in the lore word, and the plain English word keeper, do not
        # count. Encoded, like the patterns.
        for sample in ['6d7974686f73426f78', '4d5954484f535f4c494d4954', '486f72726f72443130305370656c6c73416e644d7974686f73',
                       '69734b65657065724f66', '6b65657065724e6f746573', '4b45455045525f4f4e4c595f4649454c44',
                       '4b65657065722773204e6f746573', '7368656574576974686f75744b65657065724e6f746573']:
            with self.subTest(sample=sample):
                self.assertRegex(bytes.fromhex(sample).decode(), GROUPS['horror'])
        for sample in ['637468756c68754d7974686f73', '7370656c6c73416e644d7974686f73', '496e6e6b6565706572',
                       '46656174204b6565706572', '6b65657065724964']:
            with self.subTest(sample=sample):
                self.assertNotRegex(bytes.fromhex(sample).decode(), GROUPS['horror'])

    def test_a_name_joined_by_a_hyphen_or_a_digit_counts(self):
        # As a source path or a type name joins a name to its edition.
        # Encoded, like the patterns.
        samples = {
            'fantasy': ['7061746866696e6465723265', '5061746866696e6465723265436861726163746572456469746f72', '7061746866696e6465722d3265'],
            'horror': ['636f6d706f6e656e74732f6368617261637465722d7368656574732f63616c6c2d6f662d637468756c68752d37652f', '63616c6c2d6f662d637468756c68752d3765'],
        }
        for group, encoded in samples.items():
            for sample in encoded:
                with self.subTest(group=group, sample=sample):
                    self.assertRegex(bytes.fromhex(sample).decode(), GROUPS[group])

    def test_the_spelled_out_role_name_counts(self):
        # The app says game master, or GM. Encoded, like the patterns.
        for sample in ['44756e67656f6e204d6173746572', '64756e67656f6e206d617374657273', '44554e47454f4e2d4d4153544552', '7468652044756e67656f6e5f4d6173746572']:
            with self.subTest(sample=sample):
                self.assertRegex(bytes.fromhex(sample).decode(), GROUPS['fifth'])

    def test_the_fantasy_games_characters_and_ancestry_count(self):
        # Its iconic characters, matched with their capitals, and an ancestry of
        # its setting in any letter case. Encoded, like the patterns.
        for sample in ['5365656c6168', '56616c65726f73', '457a72656e', '4d6572697369656c', '486172736b', '53656f6e69', '4665697961', '4e616b7564616d61', '4e616b7544616d612d416d70686962696f7573']:
            with self.subTest(sample=sample):
                self.assertRegex(bytes.fromhex(sample).decode(), GROUPS['fantasy'])

if __name__ == '__main__':
    unittest.main()
