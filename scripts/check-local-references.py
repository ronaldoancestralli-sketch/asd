#!/usr/bin/env python3
"""Fail when a tracked web asset points to a missing local file."""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
SCANNED_SUFFIXES = {'.html', '.htm', '.css', '.js', '.mjs'}
HTML_ATTRIBUTE_RE = re.compile(
    r'''\b(?:href|src|poster|action)\s*=\s*["']([^"']+)["']''',
    re.IGNORECASE,
)
SRCSET_RE = re.compile(r'''\bsrcset\s*=\s*["']([^"']+)["']''', re.IGNORECASE)
JS_IMPORT_RE = re.compile(
    r'''(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)["']([^"']+)["']'''
)
IMPORT_META_URL_RE = re.compile(
    r'''\bnew\s+URL\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*\)'''
)
CSS_URL_RE = re.compile(r'''\burl\(\s*["']?([^"')]+)["']?\s*\)''', re.IGNORECASE)
CSS_IMPORT_RE = re.compile(r'''@import\s+(?:url\(\s*)?["']([^"']+)["']''', re.IGNORECASE)
BLOCK_COMMENT_RE = re.compile(r'/\*.*?\*/', re.DOTALL)
HTML_COMMENT_RE = re.compile(r'<!--.*?-->', re.DOTALL)
HTML_ID_RE = re.compile(
    r'''\b(?:id|name)\s*=\s*["']([^"']+)["']''',
    re.IGNORECASE,
)

IGNORED_PREFIXES = (
    '#', 'mailto:', 'tel:', 'data:', 'javascript:', 'blob:', 'about:',
)

GENERATED_REFERENCE_SCAN_EXCLUSIONS = (
    'admin/js/vendor/',
)


def tracked_files() -> list[Path]:
    result = subprocess.run(
        ['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
        cwd=ROOT,
        check=True,
        capture_output=True,
    )
    return [ROOT / item.decode() for item in result.stdout.split(b'\0') if item]


def without_comments(text: str, suffix: str) -> str:
    if suffix in {'.html', '.htm'}:
        text = HTML_COMMENT_RE.sub('', text)
    text = BLOCK_COMMENT_RE.sub('', text)
    return '\n'.join(
        line for line in text.splitlines()
        if not line.lstrip().startswith('//')
    )


def references(path: Path, text: str) -> list[str]:
    suffix = path.suffix.lower()
    clean = without_comments(text, suffix)
    values: list[str] = []

    if suffix in {'.html', '.htm'}:
        values.extend(HTML_ATTRIBUTE_RE.findall(clean))
        for group in SRCSET_RE.findall(clean):
            values.extend(part.strip().split()[0] for part in group.split(',') if part.strip())

    if suffix in {'.html', '.htm', '.js', '.mjs'}:
        imports = JS_IMPORT_RE.findall(clean)
        if suffix in {'.js', '.mjs'}:
            imports = [
                value for value in imports
                if value.startswith(('.', '/'))
                or urlsplit(value).scheme
                or urlsplit(value).netloc
            ]
        values.extend(imports)
        values.extend(IMPORT_META_URL_RE.findall(clean))

    if suffix == '.css':
        values.extend(CSS_URL_RE.findall(clean))
        values.extend(CSS_IMPORT_RE.findall(clean))

    return values


def local_target(owner: Path, raw: str) -> Path | None:
    value = raw.strip()
    lowered = value.lower()
    if not value or lowered.startswith(IGNORED_PREFIXES):
        return None
    if len(value) > 512 or '\n' in value or '\r' in value:
        return None
    if any(marker in value for marker in ('${', '{{', '}}', '<%', '%>')):
        return None

    parsed = urlsplit(value)
    if parsed.scheme or parsed.netloc:
        return None
    clean = unquote(parsed.path).strip()
    if not clean:
        return None

    if clean.startswith('/'):
        clean = clean.lstrip('/')
        if clean == 'EchoArena':
            clean = ''
        elif clean.startswith('EchoArena/'):
            clean = clean[len('EchoArena/'):]
        target = ROOT / clean
    else:
        target = owner.parent / clean

    try:
        resolved = target.resolve()
        resolved.relative_to(ROOT.resolve())
    except (OSError, ValueError):
        return target.resolve()
    return resolved


def exists_as_static_target(target: Path) -> bool:
    try:
        if target.exists():
            return True
        if not target.suffix and target.with_suffix('.html').exists():
            return True
    except OSError:
        return False
    return False


def existing_static_target(target: Path) -> Path | None:
    try:
        if target.is_file():
            return target
        html_target = target.with_suffix('.html') if not target.suffix else target
        if html_target.is_file():
            return html_target
    except OSError:
        return None
    return None


def main() -> int:
    failures: list[str] = []
    checked = 0
    fragments_checked = 0
    owners = 0
    id_cache: dict[Path, set[str]] = {}

    for owner in tracked_files():
        if owner.suffix.lower() not in SCANNED_SUFFIXES or not owner.is_file():
            continue

        relative_owner = owner.relative_to(ROOT).as_posix()
        if relative_owner.startswith(GENERATED_REFERENCE_SCAN_EXCLUSIONS):
            continue

        owners += 1
        text = owner.read_text(encoding='utf-8')
        for raw in references(owner, text):
            parsed = urlsplit(raw.strip())
            if (
                owner.suffix.lower() in {'.html', '.htm'}
                and not parsed.scheme
                and not parsed.netloc
                and parsed.fragment
            ):
                fragment_owner = owner if not parsed.path else local_target(owner, raw)
                fragment_target = existing_static_target(fragment_owner) if fragment_owner else None
                if fragment_target and fragment_target.suffix.lower() in {'.html', '.htm'}:
                    if fragment_target not in id_cache:
                        target_text = without_comments(
                            fragment_target.read_text(encoding='utf-8'),
                            fragment_target.suffix.lower(),
                        )
                        id_cache[fragment_target] = set(HTML_ID_RE.findall(target_text))
                    fragments_checked += 1
                    fragment = unquote(parsed.fragment)
                    if fragment not in id_cache[fragment_target]:
                        failures.append(
                            f'{owner.relative_to(ROOT)} -> {raw} '
                            f'(fragmento ausente em {fragment_target.relative_to(ROOT)})'
                        )

            target = local_target(owner, raw)
            if target is None:
                continue
            checked += 1
            if not exists_as_static_target(target):
                try:
                    shown = target.relative_to(ROOT)
                except ValueError:
                    shown = target
                failures.append(f'{owner.relative_to(ROOT)} -> {raw} (resolve para {shown})')

    failures = sorted(set(failures))
    if failures:
        print(f'REFERÊNCIAS LOCAIS: FALHOU com {len(failures)} destino(s) ausente(s)', file=sys.stderr)
        for failure in failures:
            print(f'- {failure}', file=sys.stderr)
        return 1

    print(
        f'REFERÊNCIAS LOCAIS: OK · {checked} arquivos/referências e '
        f'{fragments_checked} fragmentos verificados em {owners} arquivos rastreados.'
    )
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
