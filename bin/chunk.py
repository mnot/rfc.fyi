#!/usr/bin/env python

"""Section-aware, length-bounded chunker for RFC plain-text files.

Emits JSONL on stdout, one object per chunk:

    {"rfc": 9110, "section": "7.2", "title": "Message Routing",
     "offset": 48213, "length": 1180, "text": "..."}

"offset" and "length" describe a BYTE range in the original, unmodified
file -- so the UI can deep-link (and highlight) into the source text.
"text" is the cleaned rendering of that range: page furniture removed,
body indentation stripped, page-split paragraphs rejoined.  So
len(text) is usually a little smaller than "length"; for a modern
(unpaginated) RFC the two differ only by the stripped indentation.

Standard library only.
"""

import argparse
import bisect
import hashlib
import json
import multiprocessing
import os
import re
import statistics
import sys

# --------------------------------------------------------------------------
# Packing defaults
# --------------------------------------------------------------------------

TARGET = 1200  # stop adding paragraphs once a chunk reaches this
CAP = 1600  # never exceed this
OVERLAP_MAX = 500  # only carry a trailing paragraph this small
MIN_CHUNK = 24  # drop chunks shorter than this (in characters)

# --------------------------------------------------------------------------
# Page furniture
# --------------------------------------------------------------------------

# "Fielding & Reschke        Standards Track           [Page 12]"
FOOTER_RE = re.compile(r"^.{0,100}\[\s*Page\s+[0-9ivxlcdmIVXLCDM]+\s*\]\s*$")

# "RFC 9110      HTTP Semantics       June 2022"
HEADER_RFC_RE = re.compile(r"^\s*RFC[\s-]+\S+\s", re.IGNORECASE)
MONTHS = (
    "January|February|March|April|May|June|July|August|September|October"
    "|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec"
)
HEADER_DATE_RE = re.compile(r"\s\s+(?:%s)\s+\d{4}\s*$" % MONTHS)

# --------------------------------------------------------------------------
# Headings
# --------------------------------------------------------------------------

NUM_HEAD_RE = re.compile(r"^(\d+(?:\.\d+)*)\.?[ \t]+(\S.*)$")
APPENDIX_RE = re.compile(
    r"^(?:Appendix|APPENDIX|Annex|ANNEX)[ \t]+([A-Z](?:\.\d+)*)[.:]?[ \t]*(.*)$"
)
ALPHA_HEAD_RE = re.compile(r"^([A-Z](?:\.\d+)+|[A-Z])\.[ \t]+(\S.*)$")

MAX_HEADING_LEN = 90
MAX_UNNUMBERED_WORDS = 8

# "3.2  Frame Format .......... 17" -- a contents entry, not a heading.
TOC_LINE_RE = re.compile(r"(?:\.\s*){3,}\s*[\divxlcdm]*\s*$|\s\s+\d+\s*$")

# Normalised titles whose sections are dropped wholesale.
SKIP_EXACT = {
    "table of contents",
    "contents",
    "toc",
    "status of this memo",
    "status of memo",
    "status of this document",
    "status of this standard",
    "copyright",
    "copyright notice",
    "copyright statement",
    "full copyright statement",
    "intellectual property",
    "intellectual property statement",
    "intellectual property rights",
    "ipr",
    "notices",
    "disclaimer",
    "disclaimer of validity",
    "authors address",
    "authors addresses",
    "author address",
    "author addresses",
    "address of author",
    "addresses of authors",
    "editors address",
    "editors addresses",
    "chairs address",
    "authors information",
    "author information",
    "authors contact information",
    "contact information",
    "index",
    "index of terms",
}
SKIP_OPTIONAL = {
    "acknowledgement",
    "acknowledgements",
    "acknowledgment",
    "acknowledgments",
    "acknowledgements and contributors",
    "acknowledgments and contributors",
    "contributors",
    "contributor",
}
# A reference list is "References" with at most a stock qualifier in front.
# Matching on a bare suffix is wrong: RFC 9110's "URI References" is body
# text, and "Preferences" ends in "references".
REFERENCE_HEADS = {"reference", "references", "bibliography"}
REFERENCE_MODIFIERS = {
    "normative",
    "informative",
    "informational",
    "non",
    "other",
    "additional",
    "further",
    "primary",
    "secondary",
    "selected",
    "annotated",
    "full",
    "complete",
    "updated",
    "external",
    "reading",
    "list",
    "and",
    "of",
    "appendix",
    "section",
    "acknowledgements",
    "acknowledgments",
}
ROMAN_RE = re.compile(r"^[ivxlcdm]+$")


def is_reference_section(words):
    if not words or words[-1] not in REFERENCE_HEADS:
        return False
    for word in words[:-1]:
        if word in REFERENCE_MODIFIERS or word.isdigit() or ROMAN_RE.match(word):
            continue
        return False
    return True


APOSTROPHES = "'’‘ʼ`"

# --------------------------------------------------------------------------
# Sentence splitting
# --------------------------------------------------------------------------

SENT_BREAK_RE = re.compile(r'[.!?][")\]”]?[ \t]+')
ABBREVS = {
    "e.g.",
    "i.e.",
    "etc.",
    "cf.",
    "vs.",
    "al.",
    "ca.",
    "fig.",
    "figs.",
    "no.",
    "nos.",
    "dr.",
    "mr.",
    "ms.",
    "mrs.",
    "prof.",
    "st.",
    "sec.",
    "secs.",
    "eq.",
    "ref.",
    "refs.",
    "resp.",
    "approx.",
    "viz.",
    "inc.",
    "ltd.",
    "corp.",
    "co.",
    "u.s.",
    "u.k.",
    "pp.",
    "vol.",
    "ed.",
    "eds.",
    "jr.",
    "sr.",
    "min.",
    "max.",
}
WORD_BEFORE_RE = re.compile(r"(\S+)$")

FILENAME_RE = re.compile(r"^rfc(\d+[a-z]*)\.txt$", re.IGNORECASE)


def normalise_title(title):
    """Fold a heading to a comparable key."""
    text = title.strip().lower()
    for char in APOSTROPHES:
        text = text.replace(char, "")
    text = re.sub(r"[^a-z0-9 ]+", " ", text)
    return " ".join(text.split())


def is_skipped(title, skip_optional):
    key = normalise_title(title)
    if not key:
        return False
    if key in SKIP_EXACT:
        return True
    if skip_optional and key in SKIP_OPTIONAL:
        return True
    return is_reference_section(key.split())


# --------------------------------------------------------------------------
# Byte-offset mapping
# --------------------------------------------------------------------------


class ByteMap:
    """Maps character indices in the decoded text to byte offsets."""

    def __init__(self, text, one_byte_per_char):
        self.identity = one_byte_per_char or text.isascii()
        self.positions = []
        self.prefix = []
        if self.identity:
            return
        extra = 0
        append_pos = self.positions.append
        append_pre = self.prefix.append
        for match in re.finditer(r"[^\x00-\x7f]", text):
            code = ord(match.group())
            width = 2 if code < 0x800 else (3 if code < 0x10000 else 4)
            append_pos(match.start())
            extra += width - 1
            append_pre(extra)

    def __call__(self, index):
        if self.identity:
            return index
        slot = bisect.bisect_left(self.positions, index)
        return index + (self.prefix[slot - 1] if slot else 0)


# --------------------------------------------------------------------------
# Reading and furniture stripping
# --------------------------------------------------------------------------


def decode(raw):
    """Decode RFC bytes; a handful of old RFCs are not valid UTF-8."""
    try:
        return raw.decode("utf-8"), False
    except UnicodeDecodeError:
        return raw.decode("latin-1"), True


class Line:
    __slots__ = ("text", "start", "end", "indent", "page_break")

    def __init__(self, text, start):
        self.text = text
        self.start = start
        self.end = start + len(text)
        stripped = text.lstrip()
        self.indent = len(text) - len(stripped) if stripped else -1
        self.page_break = False


def split_lines(text):
    lines = []
    pos = 0
    for raw in text.split("\n"):
        lines.append(Line(raw, pos))
        pos += len(raw) + 1
    return lines


def looks_like_header(text, repeated):
    if not text.strip():
        return False
    if len(text) > 100:
        return False
    if HEADER_RFC_RE.match(text):
        return True
    if text in repeated:
        return True
    return bool(HEADER_DATE_RE.search(text) and "  " in text)


def strip_furniture(lines):
    """Drop form feeds, running headers and page footers.

    Returns the surviving lines; each line that directly follows removed
    furniture is flagged so paragraph assembly can rejoin a page-split
    paragraph.
    """
    drop = set()
    formfeeds = []
    for i, line in enumerate(lines):
        if "\f" in line.text:
            formfeeds.append(i)
            drop.add(i)
        elif FOOTER_RE.match(line.text) and line.text.strip():
            drop.add(i)

    if formfeeds:
        # A running header follows the form feed.  It is identical on every
        # page, so exact repeats give it away even when it does not start
        # with "RFC ".  Some RFCs (e.g. 930) wrap it over two lines.
        first = []
        second = []
        for i in formfeeds:
            if lines[i].text.strip("\f \t"):
                continue  # header shared the form-feed line; already dropped
            j = i + 1
            while j < len(lines) and not lines[j].text.strip():
                j += 1
            if j < len(lines):
                first.append(j)
                if j + 1 < len(lines) and lines[j + 1].text.strip():
                    second.append(j + 1)
        seen = {}
        for j in first + second:
            seen[lines[j].text] = seen.get(lines[j].text, 0) + 1
        repeated = {text for text, n in seen.items() if n >= 2}
        for j in first:
            if looks_like_header(lines[j].text, repeated):
                drop.add(j)
                if j + 1 in second and lines[j + 1].text in repeated:
                    drop.add(j + 1)

    kept = []
    pending_break = False
    for i, line in enumerate(lines):
        if i in drop:
            pending_break = True
            continue
        line.page_break = pending_break
        pending_break = False
        kept.append(line)
    return kept


def base_indent(lines):
    """Modal indentation of body text -- 3 for modern RFCs, 0 for many old."""
    counts = {}
    for line in lines:
        if line.indent >= 0:
            counts[line.indent] = counts.get(line.indent, 0) + 1
    if not counts:
        return 0
    return max(counts, key=lambda k: (counts[k], -k))


# --------------------------------------------------------------------------
# Section detection
# --------------------------------------------------------------------------


MAX_SECTION_JUMP = 20


def parse_number(label):
    """ "1.0" and "1" are the same section; RFCs use both spellings."""
    try:
        parts = [int(part) for part in label.split(".")]
    except ValueError:
        return None
    while len(parts) > 1 and parts[-1] == 0:
        parts.pop()
    return tuple(parts)


def plausible_successor(prev, cur):
    """Guard against body prose that happens to start with a number.

    Real RFCs skip levels freely (9.3.13.1 is followed by 9.3.15.3), so the
    test is only that the number moved forward at the first component that
    differs, by a believable amount.
    """
    if prev is None:
        # Most documents start at 1; a few excerpt a deep numbering scheme
        # (RFC 1038 opens at 9.3.13.1), which prose never imitates.
        return cur[0] <= 3 or len(cur) >= 3
    for i in range(min(len(prev), len(cur))):
        if cur[i] != prev[i]:
            return prev[i] < cur[i] <= prev[i] + MAX_SECTION_JUMP
    return len(cur) == len(prev) + 1


class Heading:
    __slots__ = ("index", "label", "title")

    def __init__(self, index, label, title):
        self.index = index
        self.label = label
        self.title = title


def heading_candidate(lines, i, indented_style, column, numbered_only):
    """Classify line i as (label, title, kind) or None."""
    line = lines[i]
    if line.indent != column:
        return None
    text = line.text.strip() if column else line.text.rstrip()
    if not text or len(text) > MAX_HEADING_LEN:
        return None
    if TOC_LINE_RE.search(text):
        return None  # a table-of-contents entry, not the heading itself
    if i and lines[i - 1].text.strip():
        return None  # headings are preceded by a blank line
    if i + 1 < len(lines) and lines[i + 1].text.strip():
        return None  # ... and followed by one

    match = APPENDIX_RE.match(text)
    if match:
        title = match.group(2).strip() or "Appendix %s" % match.group(1)
        return match.group(1), title, "alpha"

    match = NUM_HEAD_RE.match(text)
    if match:
        return match.group(1).rstrip("."), match.group(2).strip(), "num"

    match = ALPHA_HEAD_RE.match(text)
    if match and indented_style:
        return match.group(1), match.group(2).strip(), "alpha"

    # Unnumbered heading.  Always accepted for the well-known boilerplate
    # names; otherwise only where a line at the structural column is
    # distinguishable from prose.
    key = normalise_title(text)
    if key in SKIP_EXACT or key in SKIP_OPTIONAL or is_reference_section(key.split()):
        return None, text.strip(), "plain"
    if key in ("abstract", "overview", "introduction", "summary", "purpose"):
        return None, text.strip(), "plain"
    if numbered_only:
        return None
    stripped = text.strip()
    if "  " in stripped:
        return None  # column gaps mean a header/author line, not a heading
    if not (stripped[0].isupper() or stripped[0].isdigit()):
        return None
    if len(stripped.split()) > MAX_UNNUMBERED_WORDS:
        return None
    if stripped.endswith((".", ",", ";")):
        return None
    if indented_style or stripped.upper() == stripped:
        # Unindented documents (RFC 1035 and friends) put body prose in
        # column 0 too, so there only an ALL-CAPS line reads as a heading.
        return None, stripped, "plain"
    return None


def find_headings(lines, indented_style, column=0, numbered_only=False):
    headings = []
    prev_num = None
    prev_alpha = None
    for i in range(len(lines)):
        found = heading_candidate(lines, i, indented_style, column, numbered_only)
        if not found:
            continue
        label, title, kind = found
        if kind == "num":
            number = parse_number(label)
            if number is None or not plausible_successor(prev_num, number):
                continue
            prev_num = number
        elif kind == "alpha":
            head = label.split(".")[0]
            if prev_alpha is not None and head < prev_alpha:
                continue
            prev_alpha = head
        headings.append(Heading(i, label, title))
    return headings


def body_headings(headings):
    return [h for h in headings if h.label or not is_skipped(h.title, True)]


def detect_sections(lines, indented_style, indent):
    """Find headings, retrying at the document's own structural column.

    Not every RFC puts headings in column 0: RFC 908 indents the whole
    document by five columns.
    """
    headings = find_headings(lines, indented_style)
    if len(body_headings(headings)) >= 2 or indent <= 0:
        return headings
    alt = find_headings(lines, indented_style, column=indent, numbered_only=True)
    if len(body_headings(alt)) > len(body_headings(headings)):
        return sorted(headings + alt, key=lambda h: h.index)
    return headings


# --------------------------------------------------------------------------
# Paragraph assembly
# --------------------------------------------------------------------------


class Piece:
    """A run of text that can be packed into a chunk."""

    __slots__ = ("text", "start", "end", "lines", "strip")

    def __init__(self, text, start, end, lines=None, strip=0):
        self.text = text
        self.start = start
        self.end = end
        self.lines = lines
        self.strip = strip

    def __len__(self):
        return len(self.text)


def render(lines, indent):
    """Join lines, removing up to `indent` columns of common leading space."""
    strip = indent
    for line in lines:
        if 0 <= line.indent < strip:
            strip = line.indent
    return "\n".join(line.text[strip:].rstrip() for line in lines), strip


def continues_paragraph(prev_lines, line):
    """Did a page break split one paragraph in two?"""
    if not prev_lines:
        return False
    tail = prev_lines[-1].text.rstrip()
    head = line.text.strip()
    if not tail or not head:
        return False
    if tail.endswith((".", ":", "!", "?", ";")):
        return False
    return head[0].islower() or head[0] in ",;"


def paragraphs(lines, indent):
    """Group lines into paragraphs, rejoining page-split ones."""
    out = []
    current = []
    for line in lines:
        if line.indent < 0:
            continue
        if current and line.page_break and continues_paragraph(current, line):
            current.append(line)
            continue
        if not current:
            current = [line]
            continue
        prev = current[-1]
        # Contiguous in the original file means no blank line came between.
        if prev.end + 1 == line.start:
            current.append(line)
        else:
            out.append(current)
            current = [line]
    if current:
        out.append(current)

    pieces = []
    for block in out:
        text, strip = render(block, indent)
        if not text.strip():
            continue
        last = block[-1]
        end = last.start + len(last.text.rstrip())
        pieces.append(Piece(text, block[0].start + strip, end, block, strip))
    return pieces


# --------------------------------------------------------------------------
# Splitting oversized paragraphs
# --------------------------------------------------------------------------


def sentence_offsets(text):
    """Character indices at which `text` may be split into sentences."""
    points = []
    for match in SENT_BREAK_RE.finditer(text):
        word = WORD_BEFORE_RE.search(text, 0, match.start() + 1)
        if word and word.group(1).lower() in ABBREVS:
            continue
        if word and re.fullmatch(r"(?:[A-Za-z]\.)+", word.group(1)):
            continue  # single-letter initials, "U.S.A."
        points.append(match.end())
    return points


def split_piece(piece, cap):
    """Break an oversized paragraph at sentence boundaries."""
    if len(piece) <= cap:
        return [piece]
    text = piece.text

    # Map every character of the rendered text back to the original file.
    # The rendered text is the paragraph's lines joined by "\n" after a
    # constant dedent, so each rendered line is a contiguous run whose
    # original start is line.start + strip.
    line_starts = []
    origins = []
    pos = 0
    for index, rendered in enumerate(text.split("\n")):
        line_starts.append(pos)
        if piece.lines is not None and index < len(piece.lines):
            origins.append(piece.lines[index].start + piece.strip)
        else:
            origins.append(piece.start + pos)
        pos += len(rendered) + 1

    def to_origin(index):
        slot = max(bisect.bisect_right(line_starts, index) - 1, 0)
        return origins[slot] + (index - line_starts[slot])

    bounds = sentence_offsets(text)
    if not bounds:
        bounds = [m.end() for m in re.finditer(r"\s+", text)]
    bounds = sorted({b for b in bounds if 0 < b < len(text)} | {len(text)})

    spans = []
    start = 0
    last = 0
    for bound in bounds:
        if bound - start > cap and last > start:
            spans.append((start, last))
            start = last
        last = bound
    if start < len(text):
        spans.append((start, len(text)))

    # A single sentence longer than the cap still has to be broken.
    final = []
    for start, end in spans:
        while end - start > cap:
            cut = text.rfind(" ", start, start + cap)
            if cut <= start:
                cut = start + cap
            final.append(_sub_piece(text, start, cut, to_origin))
            start = cut
        if end > start:
            final.append(_sub_piece(text, start, end, to_origin))
    return [p for p in final if p.text.strip()]


def _sub_piece(text, start, end, to_origin):
    body = text[start:end]
    lead = len(body) - len(body.lstrip())
    tail = len(body) - len(body.rstrip())
    inner_start = start + lead
    inner_end = end - tail
    if inner_end <= inner_start:
        inner_start, inner_end = start, max(end, start + 1)
    return Piece(
        text[inner_start:inner_end],
        to_origin(inner_start),
        to_origin(inner_end - 1) + 1,
    )


# --------------------------------------------------------------------------
# Packing
# --------------------------------------------------------------------------


def pack(pieces, target, cap, overlap):
    """Greedy packing within a single section."""
    chunks = []
    current = []
    length = 0

    def flush():
        nonlocal current, length
        if current:
            chunks.append(current)
        carry = []
        if overlap and len(current) > 1:
            tail = current[-1]
            if len(tail) <= OVERLAP_MAX:
                carry = [tail]
        current = carry
        length = sum(len(p) for p in carry) + 2 * max(len(carry) - 1, 0)

    for piece in pieces:
        added = length + (2 if current else 0) + len(piece)
        if current and (length >= target or added > cap):
            flush()
            added = length + (2 if current else 0) + len(piece)
            if current and added > cap:
                # The carried overlap does not fit; drop it.
                current = []
                length = 0
        current.append(piece)
        length = sum(len(p) for p in current) + 2 * (len(current) - 1)
    if current:
        chunks.append(current)
    return chunks


# --------------------------------------------------------------------------
# Per-file driver
# --------------------------------------------------------------------------


def rfc_id(path):
    match = FILENAME_RE.match(os.path.basename(path))
    if not match:
        return os.path.basename(path)
    ident = match.group(1)
    return int(ident) if ident.isdigit() else ident


def is_boilerplate_block(piece):
    head = piece.text[:400]
    return bool(
        re.search(
            r"^(Network Working Group|Internet Engineering Task Force|"
            r"Request for Comments|Independent Submission|"
            r"Internet Architecture Board)",
            head,
        )
        or re.search(r"(?m)^(Request for Comments|Category|ISSN|Obsoletes):", head)
        or (HEADER_RFC_RE.match(head) and HEADER_DATE_RE.search(head.split("\n")[0]))
    )


def chunk_file(path, opts):
    with open(path, "rb") as handle:
        raw = handle.read()
    text, latin = decode(raw)
    to_bytes = ByteMap(text, latin)

    lines = strip_furniture(split_lines(text))
    indent = base_indent(lines)
    indented_style = indent >= 1
    headings = detect_sections(lines, indented_style, indent)

    out = build(lines, headings, indent, rfc_id(path), to_bytes, opts, False)
    if not out:
        # Nothing survived: an early RFC with no recognisable sections, or
        # one whose whole body sits under a boilerplate heading.  Index it
        # unsectioned rather than losing the document.
        out = build(lines, [], indent, rfc_id(path), to_bytes, opts, True)
    return out


def build(lines, headings, indent, ident, to_bytes, opts, salvage):
    sections = []  # (label, title, [lines])
    if headings:
        first = headings[0].index
        if first > 0:
            sections.append((None, None, lines[:first]))
        for pos, head in enumerate(headings):
            stop = headings[pos + 1].index if pos + 1 < len(headings) else len(lines)
            sections.append((head.label, head.title, lines[head.index + 1 : stop]))
    else:
        sections.append((None, None, lines))

    out = []
    skipped_prefix = None
    seen_heading = False

    for label, title, body in sections:
        if title is None:
            # Front matter before the first heading: keep it only when the
            # document has no recognised sections at all.
            if headings:
                continue
        else:
            seen_heading = True
            number = parse_number(label) if label else None
            if skipped_prefix is not None and number is not None:
                if number[: len(skipped_prefix)] == skipped_prefix:
                    continue
                skipped_prefix = None
            if is_skipped(title, opts.skip_acks):
                skipped_prefix = number
                continue
            skipped_prefix = None

        body = drop_toc(body)
        pieces = paragraphs(body, indent)
        pieces = [p for p in pieces if not SCAN_NOTE_RE.search(p.text)]
        if title is None and not seen_heading:
            pieces = [p for p in pieces if not is_boilerplate_block(p)]
        if salvage:
            pieces = [p for p in pieces if not BOILERPLATE_TEXT_RE.search(p.text)]
        if not pieces:
            continue
        expanded = []
        for piece in pieces:
            expanded.extend(split_piece(piece, opts.cap))
        for group in pack(expanded, opts.target, opts.cap, not opts.no_overlap):
            body_text = "\n\n".join(p.text for p in group)
            if len(body_text.strip()) < MIN_CHUNK:
                continue
            start = to_bytes(group[0].start)
            end = to_bytes(group[-1].end)
            out.append(
                {
                    "rfc": ident,
                    "section": label,
                    "title": title,
                    "offset": start,
                    "length": end - start,
                    "text": body_text,
                }
            )
    return out


# The RFC Editor appended a transcription credit to many rescanned RFCs.
SCAN_NOTE_RE = re.compile(
    r"machine[- ]readable form|into the online RFC archives", re.IGNORECASE
)

BOILERPLATE_TEXT_RE = re.compile(
    r"Distribution of this memo is unlimited"
    r"|memo (?:provides information|does not specify)"
    r"|Copyright \(c\)"
    r"|This memo defines an Experimental Protocol"
    r"|for the Internet community",
    re.IGNORECASE,
)


TOC_TITLE_RE = re.compile(r"^\s*(table of contents|contents)\s*$", re.IGNORECASE)
TOC_ENTRY_RE = re.compile(r"(?:\.{3,}|\s\s)\s*\d+\s*$")


def drop_toc(body):
    """Remove a centred 'Table of Contents' and its entry lines."""
    out = []
    skipping = False
    for line in body:
        if TOC_TITLE_RE.match(line.text) and line.text.strip():
            skipping = True
            continue
        if skipping:
            if line.indent < 0:
                continue
            if TOC_ENTRY_RE.search(line.text):
                continue
            skipping = False
        out.append(line)
    # Stray TOC-looking blocks (dot leaders) anywhere else.
    filtered = []
    block = []

    def emit(block):
        if not block:
            return
        entries = sum(1 for ln in block if TOC_ENTRY_RE.search(ln.text))
        if len(block) >= 4 and entries >= 0.7 * len(block):
            return
        filtered.extend(block)

    for line in out:
        if line.indent < 0:
            emit(block)
            block = []
            filtered.append(line)
        else:
            block.append(line)
    emit(block)
    return filtered


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------


def _rfc_sort_key(name):
    """Sort by RFC *number*, not filename.

    Lexicographic order interleaves the series -- 1, 10, 100, 1000, 10002 --
    so a newly published RFC lands in the middle of the output. Numeric order
    makes the corpus append-only, because RFCs are immutable and numbered
    monotonically: the only thing a later run adds is higher numbers, at the
    end.

    That is what lets an incremental build reuse existing embedding shards.
    Under filename order every shard after the insertion point would be
    stale, and each monthly update would re-embed the entire corpus.

    Non-numeric ids (rfc17a) sort just after their numeric prefix, which
    keeps them stable relative to their neighbours.
    """
    base = os.path.basename(name).lower()
    match = re.match(r"rfc(\d+)(.*)\.txt$", base)
    if not match:
        return (1, 0, base)
    return (0, int(match.group(1)), match.group(2))


def gather_paths(args):
    paths = []
    for arg in args:
        if os.path.isdir(arg):
            for name in sorted(os.listdir(arg), key=_rfc_sort_key):
                if name.lower().endswith(".txt"):
                    paths.append(os.path.join(arg, name))
        else:
            paths.append(arg)
    return paths


def file_digest(path):
    """SHA-256 of an RFC's text file, as published.

    A later build compares these to tell whether an RFC has been reissued
    (RFC 9920 s7.6 allows it), because that is the one thing that moves a
    chunk's byte offsets without changing its RFC number.
    """
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


class Worker:
    def __init__(self, opts):
        self.opts = opts

    def __call__(self, path):
        try:
            return path, chunk_file(path, self.opts), file_digest(path)
        except Exception as exc:  # keep one bad file from killing the run
            return path, exc, None


def percentile(values, fraction):
    if not values:
        return 0
    index = min(int(round(fraction * (len(values) - 1))), len(values) - 1)
    return values[index]


def report(counts, lengths, empty, errors, opts, out):
    lengths.sort()
    total = len(lengths)
    print("files:            %d" % len(counts), file=out)
    print("chunks:           %d" % total, file=out)
    if counts:
        per = sorted(counts.values())
        print(
            "chunks/rfc:       mean %.1f  median %d  max %d  min %d"
            % (statistics.mean(per), statistics.median(per), per[-1], per[0]),
            file=out,
        )
    if total:
        print(
            "chunk chars:      mean %.0f  median %d  min %d  max %d"
            % (
                statistics.mean(lengths),
                percentile(lengths, 0.5),
                lengths[0],
                lengths[-1],
            ),
            file=out,
        )
        marks = [0.05, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99]
        print(
            "                  "
            + "  ".join("p%d=%d" % (m * 100, percentile(lengths, m)) for m in marks),
            file=out,
        )
        budget = opts.token_budget * opts.chars_per_token
        over = sum(1 for length in lengths if length > budget)
        print(
            "over %d tokens:   %d (%.2f%%)  [>%d chars at %g chars/token]"
            % (
                opts.token_budget,
                over,
                100.0 * over / total,
                budget,
                opts.chars_per_token,
            ),
            file=out,
        )
        over_cap = sum(1 for length in lengths if length > opts.cap)
        print("over hard cap:    %d" % over_cap, file=out)
    print("zero-chunk files: %d" % len(empty), file=out)
    if empty:
        print(
            "                  "
            + " ".join(os.path.basename(p) for p in empty[:40])
            + (" ..." if len(empty) > 40 else ""),
            file=out,
        )
    if errors:
        print("errors:           %d" % len(errors), file=out)
        for path, exc in errors[:10]:
            print("                  %s: %r" % (os.path.basename(path), exc), file=out)


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("paths", nargs="+", help="directories or .txt files")
    parser.add_argument("--target", type=int, default=TARGET)
    parser.add_argument("--cap", type=int, default=CAP)
    parser.add_argument("--no-overlap", action="store_true")
    parser.add_argument(
        "--keep-acks",
        dest="skip_acks",
        action="store_false",
        default=True,
        help="keep Acknowledgements/Contributors sections (dropped by default)",
    )
    parser.add_argument(
        "--stats",
        action="store_true",
        help="write a summary to stderr instead of JSONL",
    )
    parser.add_argument(
        "--sources",
        help="also write {rfc: sha256} for the files chunked "
        "(the shape bin/indexfmt.py reads)",
    )
    parser.add_argument("--token-budget", type=int, default=512)
    parser.add_argument("--chars-per-token", type=float, default=4.0)
    parser.add_argument(
        "-j",
        "--jobs",
        type=int,
        default=0,
        help="worker processes (default: cpu count)",
    )
    opts = parser.parse_args()

    paths = gather_paths(opts.paths)
    jobs = opts.jobs or min(os.cpu_count() or 1, 8)
    worker = Worker(opts)

    if jobs > 1 and len(paths) > 4:
        pool = multiprocessing.Pool(jobs)
        results = pool.imap(worker, paths, chunksize=16)
    else:
        pool = None
        results = map(worker, paths)

    counts = {}
    lengths = []
    empty = []
    errors = []
    digests = {}
    write = sys.stdout.write
    for path, chunks, digest in results:
        if isinstance(chunks, Exception):
            errors.append((path, chunks))
            continue
        digests[str(rfc_id(path))] = digest
        counts[path] = len(chunks)
        if not chunks:
            empty.append(path)
        if opts.stats:
            lengths.extend(len(c["text"]) for c in chunks)
        else:
            for chunk in chunks:
                write(json.dumps(chunk, ensure_ascii=False) + "\n")
    if pool is not None:
        pool.close()
        pool.join()
    if opts.sources:
        tmp = opts.sources + ".tmp"
        with open(tmp, "w", encoding="utf-8") as handle:
            json.dump(
                {"digest": "sha256", "rfcs": digests}, handle, indent=1, sort_keys=True
            )
            handle.write("\n")
        os.replace(tmp, opts.sources)
    if opts.stats:
        report(counts, lengths, empty, errors, opts, sys.stderr)
    elif errors:
        report({}, [], [], errors, opts, sys.stderr)


if __name__ == "__main__":
    try:
        main()
    except BrokenPipeError:
        os.dup2(os.open(os.devnull, os.O_WRONLY), sys.stdout.fileno())
        sys.exit(0)
    except KeyboardInterrupt:
        sys.exit(130)
