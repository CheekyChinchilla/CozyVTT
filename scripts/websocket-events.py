"""
The WebSocket event inventory, read out of the handlers themselves.

The hand-written catalogue in backend/docs/WEBSOCKET_DOCUMENTATION.md fell about
half a protocol behind — whole subsystems (fog, walls, lights, pings) had no
entry at all, while token movement had two hundred lines. An exhaustive list is
machine work; this generates it.

    python scripts/websocket-events.py            # print the markdown table
    python scripts/websocket-events.py --check    # non-zero if the doc is behind

Run from the repository root. The `--check` form is what stops this drifting
again: it regenerates the table and fails on any difference from the one in the
doc, so a handler that gains or loses a gate, an event that goes away, or a
hand-edited cell all fail it.
"""

import argparse
import glob
import io
import os
import re
import sys

# The table uses arrows and em dashes; a Windows console defaults to cp1252 and
# cannot encode them.
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# Sockets are wired up under websocket/, but a route can also push an event by
# calling one of the broadcast helpers, and those were invisible here — the
# table reported itself complete while omitting every event sent from a route.
HANDLERS = [
    'backend/src/websocket/**/*.ts',
    'backend/src/routes/**/*.ts',
]
DOC = 'backend/docs/WEBSOCKET_DOCUMENTATION.md'
BEGIN = '<!-- BEGIN GENERATED EVENTS -->'
END = '<!-- END GENERATED EVENTS -->'

# The "who may send it" column is read off the shared predicates in
# services/permissions.ts and a refusal of every non-DM. A handler that gates
# inline some other way is listed as "Any member": the handler is
# authoritative, and the line above the table says so.
CAVEAT = ('_Who may send it is read from the shared permission predicates each '
          'handler calls; the handler itself is authoritative._')


def sources():
    seen = set()
    for pattern in HANDLERS:
        for path in glob.glob(pattern, recursive=True):
            normalised = path.replace('\\', '/')
            if '__tests__' in normalised or normalised in seen:
                continue
            seen.add(normalised)
            yield path, io.open(path, encoding='utf-8').read()


def describe(text, index):
    """The `/** name — description */` block immediately above a handler."""
    before = text[:index]
    block = re.search(r'/\*\*((?:(?!\*/).)*)\*/\s*$', before, re.S)
    if not block:
        return ''
    body = ' '.join(
        line.strip().lstrip('*').strip()
        for line in block.group(1).split('\n')
    ).strip()
    # Drop a leading repetition of the event name, however it was punctuated.
    body = re.sub(r'^[A-Za-z0-9_.:]+\s*[—\-–]\s*', '', body)
    return re.split(r'(?<=[.!?])\s', body)[0].strip() if body else ''


def literal_end(text, i):
    """Where the comment or string literal starting at text[i] ends; None if none does."""
    if text.startswith('//', i):
        end = text.find('\n', i)
        return len(text) if end == -1 else end
    if text.startswith('/*', i):
        end = text.find('*/', i + 2)
        return len(text) if end == -1 else end + 2
    quote = text[i]
    if quote not in '\'"`':
        return None
    j = i + 1
    while j < len(text) and text[j] != quote:
        if text[j] == '\\':
            j += 2
        elif quote == '`' and text.startswith('${', j):
            j = interpolation_end(text, j + 2)
        elif text[j] == '\n' and quote != '`':
            return j
        else:
            j += 1
    return min(j + 1, len(text))


def interpolation_end(text, i):
    """From just inside a template literal's `${`, the position after its `}`."""
    depth = 0
    while i < len(text):
        end = literal_end(text, i)
        if end is not None:
            i = end
            continue
        if text[i] == '{':
            depth += 1
        elif text[i] == '}':
            if depth == 0:
                return i + 1
            depth -= 1
        i += 1
    return len(text)


def masked(text, keep_strings=False):
    """
    The source with its comments blanked, and its string and template literals
    too unless `keep_strings`, so a bracket or keyword inside one is not read
    as code. Blanked characters become spaces and newlines stay, so every
    position still matches the original. A regex literal is read as code: a
    quote or bracket inside one would throw the matching off.
    """
    out = list(text)
    i = 0
    while i < len(text):
        end = literal_end(text, i)
        if end is None:
            i += 1
            continue
        if not keep_strings or text.startswith(('//', '/*'), i):
            for k in range(i, end):
                if out[k] != '\n':
                    out[k] = ' '
        i = end
    return ''.join(out)


def closing(code, i):
    """The position of the bracket that closes the one at code[i]."""
    depth = 0
    for j in range(i, len(code)):
        if code[j] in '([{':
            depth += 1
        elif code[j] in ')]}':
            depth -= 1
            if depth == 0:
                return j
    return len(code) - 1


def statement_end(code, i):
    """Where the statement or argument starting at code[i] ends."""
    depth = 0
    for j in range(i, len(code)):
        if code[j] in '([{':
            depth += 1
        elif code[j] in ')]}':
            if depth == 0:
                return j
            depth -= 1
        elif code[j] in ';,' and depth == 0:
            return j
    return len(code)


FUNCTION_START = re.compile(r'\s*(?:throttle\(\s*)?(?:async\b\s*)?')
ARROW = re.compile(r'\s*(?::[^;{}]*?)?=>\s*')


def function_body(code, i):
    """
    The body of the function value starting at code[i], as (start, end,
    is_block), or None when the value is not a function. `throttle(fn, ms)`
    counts as fn. An arrow's expression body runs to the end of its statement.
    """
    i = FUNCTION_START.match(code, i).end()
    if re.compile(r'function\b').match(code, i):
        params = code.find('(', i)
        start = code.find('{', closing(code, params)) if params != -1 else -1
        return (start, closing(code, start) + 1, True) if start != -1 else None
    if code.startswith('(', i):
        after = closing(code, i) + 1
    else:
        param = re.compile(r'[A-Za-z_$][\w$]*').match(code, i)
        if not param:
            return None
        after = param.end()
    arrow = ARROW.match(code, after)
    if not arrow:
        return None
    start = arrow.end()
    if code.startswith('{', start):
        return start, closing(code, start) + 1, True
    return start, statement_end(code, start), False


def definition(code, name):
    """
    The same-file function `name`, as (definition start, body start, body end,
    is_block), or None. A `const` counts only when its value is a function.
    """
    pattern = r'\bfunction\s+' + re.escape(name) + r'\b|\bconst\s+' + re.escape(name) + r'\s*='
    for d in re.finditer(pattern, code):
        body = function_body(code, d.start() if d.group().startswith('function') else d.end())
        if body:
            return (d.start(),) + body
    return None


def handler_body(code, m):
    """
    The handler registered at `m`, plus any same-file function it calls
    outright (the throttled per-frame move hands off to one). Returns the spans
    the permission predicates are looked for in, each function taken only to
    the end of its own body, and the block bodies a DM-only refusal is looked
    for in. Only a bare call counts, not a method call: `.map(` must not pull
    in a `const map` from elsewhere in the file.
    """
    call_end = closing(code, m.start() + len('socket.on')) + 1
    spans, blocks = [(m.start(), call_end)], []
    value = re.compile(r'\s*,').match(code, m.end())
    own = function_body(code, value.end()) if value else None
    if own and own[2]:
        blocks.append(own[:2])
    for called in sorted(set(re.findall(r'(?<![.\w])([A-Za-z_]\w*)\(', code[m.start():call_end]))):
        d = definition(code, called)
        if d:
            spans.append((d[0], d[2]))
            if d[3]:
                blocks.append(d[1:3])
    return spans, blocks


IF = re.compile(r'if\s*\(')
RETURN = re.compile(r'return\b')
BARE_RETURN = re.compile(r'return\s*(?:;|(?=\}))')
DM_TERM = re.compile(r"""socket\.role\s*!==?\s*(['"])DM\1""")


def ends_in_return(code, start, end):
    """Whether the last statement in code[start:end] is a `return;`."""
    depth, last = 0, None
    for j in range(start, end):
        if code[j] in '([{':
            depth += 1
        elif code[j] in ')]}':
            depth -= 1
        elif depth == 0 and RETURN.match(code, j) and not re.match(r'[\w$.]', code[j - 1]):
            last = j
    return (last is not None and BARE_RETURN.match(code, last) is not None
            and not code[statement_end(code, last) + 1:end].strip())


def refuses_every_non_dm(code, plain, i):
    """
    Whether the `if` at code[i] returns for every non-DM: its branch ends in
    `return;`, and its condition is `socket.role !== 'DM'` alone or as one side
    of an `||`, or its branch says "Only the DM". `socket.role !== 'DM' && ...`
    refuses only some non-DMs (the character owner test, a spectator refusal),
    so it is not one. Nor is a branch that returns a value: that is a helper
    answering its caller, which then decides.
    """
    paren = code.index('(', i)
    close = closing(code, paren)
    branch = re.compile(r'\s*').match(code, close + 1).end()
    if code.startswith('{', branch):
        branch_end = closing(code, branch)
        returns = ends_in_return(code, branch + 1, branch_end)
    else:
        branch_end = statement_end(code, branch)
        returns = BARE_RETURN.match(code, branch) is not None
    if not returns:
        return False
    terms, depth, last = [], 0, paren + 1
    for j in range(paren + 1, close):
        if code[j] in '([{':
            depth += 1
        elif code[j] in ')]}':
            depth -= 1
        elif depth == 0 and code.startswith('||', j):
            terms.append(plain[last:j])
            last = j + 2
    terms.append(plain[last:close])
    for term in terms:
        term = term.strip()
        while term.startswith('(') and closing(term, 0) == len(term) - 1:
            term = term[1:-1].strip()
        if DM_TERM.fullmatch(term):
            return True
    return 'Only the DM' in plain[branch:branch_end]


def dm_only(code, plain, start, end):
    """
    Whether the block body code[start:end] turns every non-DM away: an `if`
    among its own statements that does, one inside a `try` included. One in a
    nested block, an `else` or a callback is conditional, and does not count,
    nor does a branch that carries on (a player's door toggle, a player's
    initiative roll).
    """
    stack = []
    for i in range(start + 1, end - 1):
        ch = code[i]
        if ch in '([{':
            opens_try = ch == '{' and re.search(r'\btry\s*$', code[max(0, i - 40):i])
            stack.append('try' if opens_try else ch)
        elif ch in ')]}':
            if stack:
                stack.pop()
        elif (ch == 'i' and all(s == 'try' for s in stack) and IF.match(code, i)
              and not re.search(r'(?:[\w$.]|\belse\s*)$', code[max(0, i - 40):i])
              and refuses_every_non_dm(code, plain, i)):
            return True
    return False


def collect():
    """Every event, with its direction and how its handler is gated."""
    inbound, outbound = {}, {}
    for path, text in sources():
        code, plain = masked(text), masked(text, keep_strings=True)
        for m in re.finditer(r"socket\.on\(\s*'([^']+)'", text):
            name = m.group(1)
            if name in ('disconnect', 'error', 'ping'):
                continue
            spans, blocks = handler_body(code, m)
            body = ''.join(text[start:end] for start, end in spans)
            inbound.setdefault(name, {
                'dm': any(dm_only(code, plain, start, end) for start, end in blocks),
                # The shared predicates in services/permissions.ts, which is
                # where a handler refuses spectators or other players' tokens.
                'controls': 'canControlToken(' in body,
                'players': 'canRollDice(' in body,
                'doors': 'canToggleDoor(' in body,
                'owner': 'character.userId !== socket.userId' in body,
                'spectator': "socket.role === 'SPECTATOR'" in body,
                'paused': 'canMoveTokensNow(' in body,
                'desc': describe(text, m.start()),
                'file': os.path.basename(path),
            })
        # Direct emits, plus the helpers in websocket/utils.ts that wrap them —
        # `broadcastToCampaign(id, 'event', data)` reaches a client just as
        # surely as `socket.emit`, so it belongs in the same table.
        # The token move handlers hand the event name to a helper that picks
        # the recipients, so the name is that call's first argument. A map's
        # live edits go through emitToMapReaders (or the map routes' wrapper,
        # tellMapReaders), where the name is the first quoted argument.
        patterns = (
            r"\.emit\(\s*'([^']+)'",
            r"broadcastTo(?:Campaign|User)\(\s*[^,]+,\s*'([^']+)'",
            r"emitMoveTo(?:VisibleSockets|DragRecipients)\(\s*'([^']+)'",
            r"(?:emitToMapReaders|tellMapReaders)\(\s*[^'()]*'([^']+)'",
        )
        for pattern in patterns:
            for m in re.finditer(pattern, text):
                name = m.group(1)
                if name in ('error',):
                    continue
                outbound.setdefault(name, {'file': os.path.basename(path)})
    return inbound, outbound


def who_may_send(info):
    if info['dm']:
        return 'DM only'
    if info['doors']:
        return 'DM; a player may toggle an unlocked door'
    if info['controls']:
        return "DM, or the token's player while the session is live" if info['paused'] else "DM, or the token's player"
    if info['owner']:
        return "DM, or the character's owner, never a spectator" if info['spectator'] else "DM, or the character's owner"
    if info['players']:
        return 'DM and players'
    return 'Any member'


def table(inbound, outbound):
    lines = [
        CAVEAT,
        '',
        '### Client → server',
        '',
        '| Event | Who may send it | What it does |',
        '| --- | --- | --- |',
    ]
    for name in sorted(inbound):
        info = inbound[name]
        lines.append(f"| `{name}` | {who_may_send(info)} | {info['desc'] or '—'} |")
    lines += ['', '### Server → client', '', '| Event | Emitted from |', '| --- | --- |']
    for name in sorted(outbound):
        lines.append(f"| `{name}` | `{outbound[name]['file']}` |")
    return '\n'.join(lines)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--check', action='store_true',
                    help='exit non-zero if the doc differs from what --write would produce')
    ap.add_argument('--write', action='store_true',
                    help='rewrite the generated block in the doc')
    args = ap.parse_args()

    inbound, outbound = collect()
    rendered = table(inbound, outbound)

    if args.check or args.write:
        doc = io.open(DOC, encoding='utf-8').read()
        if BEGIN not in doc or END not in doc:
            print(f'{DOC} has no generated block; add {BEGIN} / {END}')
            return 1
        current = doc[doc.index(BEGIN) + len(BEGIN):doc.index(END)]

        if args.check:
            stored = current.strip().split('\n')
            wanted = rendered.strip().split('\n')
            if stored != wanted:
                print(f'{DOC} is behind the handlers. Lines that differ:')
                for line in sorted(set(wanted) - set(stored)):
                    print('  +', line)
                for line in sorted(set(stored) - set(wanted)):
                    print('  -', line)
                print('\nRun: python scripts/websocket-events.py --write')
                return 1
            print(f'{len(inbound)} inbound + {len(outbound)} outbound events, all listed.')
            return 0

        updated = (doc[:doc.index(BEGIN) + len(BEGIN)] + '\n\n' + rendered + '\n\n'
                   + doc[doc.index(END):])
        io.open(DOC, 'w', encoding='utf-8', newline='\n').write(updated)
        print(f'Wrote {len(inbound)} inbound and {len(outbound)} outbound events into {DOC}')
        return 0

    print(rendered)
    return 0


if __name__ == '__main__':
    sys.exit(main())
