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
# services/permissions.ts and a few fixed phrases. A handler that gates inline
# some other way is listed as "Any member": the handler is authoritative, and
# the line above the table says so.
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


def handler_body(text, start, handlers, i):
    """
    The handler from its `socket.on(` to the next one, plus the body of any
    same-file function it calls outright (the throttled per-frame move hands
    off to one). Only a bare call counts, not a method call: `.map(` must not
    pull in a `const map` from elsewhere in the file. Only a function
    definition is followed, not every `const` that shares the name.
    """
    body = text[start:handlers[i + 1].start() if i + 1 < len(handlers) else len(text)]
    for called in set(re.findall(r'(?<![.\w])([A-Za-z_]\w*)\(', body)):
        d = re.search(
            r'(?:function\s+' + re.escape(called) + r'\b'
            r'|const\s+' + re.escape(called) + r'\s*=\s*(?:async\s*)?(?:\(|[A-Za-z_]\w*\s*=>|throttle\())',
            text)
        if d:
            nxt = text.find('socket.on(', d.end())
            body += text[d.start():nxt if nxt != -1 else len(text)]
    return body


def collect():
    """Every event, with its direction and how its handler is gated."""
    inbound, outbound = {}, {}
    for path, text in sources():
        handlers = list(re.finditer(r"socket\.on\(\s*'([^']+)'", text))
        for i, m in enumerate(handlers):
            name = m.group(1)
            if name in ('disconnect', 'error', 'ping'):
                continue
            window = text[m.end():m.end() + 900]
            body = handler_body(text, m.end(), handlers, i)
            # A refusal of anyone who is neither DM nor player is a spectator
            # refusal, not a DM-only gate, whatever the first clause says.
            dm_only = ('Only the DM' in window
                       or ("role !== 'DM'" in window
                           and "role !== 'DM' && socket.role !== 'PLAYER'" not in window))
            inbound.setdefault(name, {
                'dm': dm_only,
                # The shared predicates in services/permissions.ts, which is
                # where a handler refuses spectators or other players' tokens.
                'controls': 'canControlToken(' in body,
                'players': 'canRollDice(' in body,
                'doors': 'canToggleDoor(' in body,
                'owner': 'character.userId !== socket.userId' in body,
                'desc': describe(text, m.start()),
                'file': os.path.basename(path),
            })
        # Direct emits, plus the helpers in websocket/utils.ts that wrap them —
        # `broadcastToCampaign(id, 'event', data)` reaches a client just as
        # surely as `socket.emit`, so it belongs in the same table.
        patterns = (
            r"\.emit\(\s*'([^']+)'",
            r"broadcastTo(?:Campaign|User)\(\s*[^,]+,\s*'([^']+)'",
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
        return "DM, or the token's player"
    if info['owner']:
        return "DM, or the character's owner"
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
