"""
Reading TypeScript source well enough for the documentation checks.

scripts/spec-coverage.py and scripts/websocket-events.py find routes and
socket events with patterns. Run over raw text, a pattern also matches inside
a comment or a string, and a bracket in one throws off the matching of the
call around it. These blank comments (and strings, when asked) without moving
anything, so positions and line numbers still match the original.
"""


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


def line_of(text, index):
    """The 1-based line number of text[index]."""
    return text.count('\n', 0, index) + 1
