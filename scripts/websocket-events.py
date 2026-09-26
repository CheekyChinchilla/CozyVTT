"""
The WebSocket event inventory, read out of the handlers themselves.

The hand-written catalogue in backend/docs/WEBSOCKET_DOCUMENTATION.md fell about
half a protocol behind — whole subsystems (fog, walls, lights, pings) had no
entry at all, while token movement had two hundred lines. An exhaustive list is
machine work; this generates it.

    python scripts/websocket-events.py            # print the markdown table
    python scripts/websocket-events.py --check    # non-zero if the doc is behind

Run from the repository root. The `--check` form is what stops this drifting
again: it fails when an event exists in the code with no line in the table.
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


def collect():
    """Every event, with its direction and whether the handler is DM-gated."""
    inbound, outbound = {}, {}
    for path, text in sources():
        handlers = list(re.finditer(r"socket\.on\(\s*'([^']+)'", text))
        for i, m in enumerate(handlers):
            name = m.group(1)
            if name in ('disconnect', 'error', 'ping'):
                continue
            window = text[m.end():m.end() + 900]
            # The whole handler, up to the next one: the shared predicates can
            # sit well past the first 900 characters of a long handler.
            body = text[m.end():handlers[i + 1].start() if i + 1 < len(handlers) else len(text)]
            # A handler that hands straight off to a function defined in the
            # same file (the throttled per-frame move does) is judged by that
            # function too, from its definition to the next handler.
            for called in set(re.findall(r'\b([A-Za-z_]\w*)\(', body)):
                d = re.search(r'(?:const|function)\s+' + re.escape(called) + r'\b', text)
                if d:
                    nxt = text.find('socket.on(', d.end())
                    body += text[d.start():nxt if nxt != -1 else len(text)]
            inbound.setdefault(name, {
                'dm': "role !== 'DM'" in window or 'Only the DM' in window,
                # The shared predicates in services/permissions.ts, which is
                # where a handler refuses spectators or other players' tokens.
                'controls': 'canControlToken(' in body,
                'players': 'canRollDice(' in body,
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


def table(inbound, outbound):
    lines = [
        '### Client → server',
        '',
        '| Event | Who may send it | What it does |',
        '| --- | --- | --- |',
    ]
    for name in sorted(inbound):
        info = inbound[name]
        if info['dm']:
            who = 'DM only'
        elif info['controls']:
            who = "DM, or the token's player"
        elif info['players']:
            who = 'DM and players'
        else:
            who = 'Any member'
        lines.append(f"| `{name}` | {who} | {info['desc'] or '—'} |")
    lines += ['', '### Server → client', '', '| Event | Emitted from |', '| --- | --- |']
    for name in sorted(outbound):
        lines.append(f"| `{name}` | `{outbound[name]['file']}` |")
    return '\n'.join(lines)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--check', action='store_true',
                    help='exit non-zero if the doc is missing an event')
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
            missing = [n for n in list(inbound) + list(outbound)
                       if f'`{n}`' not in current]
            if missing:
                print('Events in the code with no line in the table:')
                for n in sorted(missing):
                    print('  ', n)
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
