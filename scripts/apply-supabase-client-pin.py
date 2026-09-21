#!/usr/bin/env python3
from pathlib import Path
import posixpath
import re
import subprocess

VERSION = '2.112.2'
TOKEN = '20260823-security-supabase-pin-1'
OLD_ESM = 'https://esm.sh/@supabase/supabase-js@2?bundle'
PINNED_ESM = f'https://esm.sh/@supabase/supabase-js@{VERSION}?bundle'
FORBIDDEN_MUTATION = 'js/game-stat-engine.js'

# Captura caminho, query e fragmento separadamente para nunca perder parâmetros
# funcionais como active/mode. A migração só acrescenta um marcador de cache.
QUOTED_JS_RE = re.compile(
    r'(?P<quote>[\'\"])(?P<path>(?!https?:|//|data:)[^\'\"\n]+?\.js)'
    r'(?P<query>\?[^\'\"#\n]*)?(?P<hash>#[^\'\"\n]*)?(?P=quote)',
    re.IGNORECASE,
)


def git_files():
    result = subprocess.run(
        ['git', 'ls-files'], check=True, capture_output=True, text=True
    )
    return [Path(line) for line in result.stdout.splitlines() if line.strip()]


def is_browser_text(path: Path):
    p = path.as_posix()
    if path.suffix.lower() == '.html':
        return True
    if path.suffix.lower() in {'.js', '.mjs'}:
        return p.startswith('js/') or p.startswith('admin/js/')
    return False


def resolve_ref(source: Path, ref_path: str):
    if ref_path.startswith('/'):
        return ref_path.lstrip('/')
    return posixpath.normpath(posixpath.join(source.parent.as_posix(), ref_path))


def query_parts(query: str):
    if not query:
        return []
    body = query[1:]
    normalized = body.replace('&amp;', '&')
    return [part for part in normalized.split('&') if part]


def has_cache_marker(query: str):
    parts = query_parts(query)
    return f'v={TOKEN}' in parts or f'sb={TOKEN}' in parts


def add_cache_marker(match):
    quote = match.group('quote')
    ref_path = match.group('path')
    query = match.group('query') or ''
    hash_part = match.group('hash') or ''

    if has_cache_marker(query):
        return match.group(0)

    if query:
        # Preserva byte a byte toda a query preexistente e só acrescenta o
        # marcador ao final. Isso mantém v, active, mode e qualquer outro dado.
        separator = '&amp;' if '&amp;' in query else '&'
        new_query = f'{query}{separator}sb={TOKEN}'
        if not new_query.startswith(query):
            raise SystemExit(f'Hard stop: query não preservada em {match.group(0)}')
    else:
        new_query = f'?v={TOKEN}'

    return f'{quote}{ref_path}{new_query}{hash_part}{quote}'


def main():
    files = [p for p in git_files() if is_browser_text(p)]
    texts = {}
    for path in files:
        try:
            texts[path.as_posix()] = path.read_text(encoding='utf-8')
        except (OSError, UnicodeDecodeError):
            pass

    central = 'js/supabase.js'
    if central not in texts:
        raise SystemExit('js/supabase.js não encontrado no inventário rastreado.')

    central_text = texts[central]
    if PINNED_ESM not in central_text:
        if OLD_ESM not in central_text:
            raise SystemExit('Import esm.sh esperado não encontrado em js/supabase.js.')
        texts[central] = central_text.replace(OLD_ESM, PINNED_ESM, 1)

    changed_js = {central}
    rewrites = []

    # 1) Atualiza toda referência direta ao módulo central.
    for source, text in list(texts.items()):
        path = Path(source)
        if path.suffix.lower() not in {'.js', '.mjs'}:
            continue

        def direct_repl(match):
            target = resolve_ref(path, match.group('path'))
            if target != central:
                return match.group(0)
            new = add_cache_marker(match)
            if new != match.group(0):
                rewrites.append((source, match.group(0), new))
            return new

        new_text = QUOTED_JS_RE.sub(direct_repl, text)
        if new_text != text:
            if source == FORBIDDEN_MUTATION:
                raise SystemExit(f'Hard stop: migração tentaria alterar {FORBIDDEN_MUTATION}.')
            texts[source] = new_text
            changed_js.add(source)

    # 2) Propaga o cache-busting até todos os importadores/loaders dos JS alterados.
    for _ in range(50):
        wave_changed = False
        for source, text in list(texts.items()):
            path = Path(source)

            def chain_repl(match):
                target = resolve_ref(path, match.group('path'))
                if target not in changed_js:
                    return match.group(0)
                new = add_cache_marker(match)
                if new != match.group(0):
                    rewrites.append((source, match.group(0), new))
                return new

            new_text = QUOTED_JS_RE.sub(chain_repl, text)
            if new_text != text:
                if source == FORBIDDEN_MUTATION:
                    raise SystemExit(f'Hard stop: migração tentaria alterar {FORBIDDEN_MUTATION}.')
                texts[source] = new_text
                wave_changed = True
                if path.suffix.lower() in {'.js', '.mjs'}:
                    changed_js.add(source)

        if not wave_changed:
            break
    else:
        raise SystemExit('Fechamento de cache excedeu 50 ondas; possível ciclo inesperado.')

    # 3) Invariante crítica: qualquer referência que já possuía query deve
    # continuar contendo a query original inteira como prefixo da nova query.
    for source, old, new in rewrites:
        old_match = QUOTED_JS_RE.fullmatch(old)
        new_match = QUOTED_JS_RE.fullmatch(new)
        if not old_match or not new_match:
            raise SystemExit(f'Hard stop: reescrita não parseável em {source}: {old} -> {new}')
        old_query = old_match.group('query') or ''
        new_query = new_match.group('query') or ''
        if old_query and not new_query.startswith(old_query):
            raise SystemExit(
                f'Hard stop: parâmetros funcionais perdidos em {source}: {old} -> {new}'
            )

    changed_files = []
    for source, new_text in texts.items():
        path = Path(source)
        old_text = path.read_text(encoding='utf-8')
        if new_text == old_text:
            continue
        path.write_text(new_text, encoding='utf-8')
        changed_files.append(source)

    if FORBIDDEN_MUTATION in changed_files:
        raise SystemExit(f'Hard stop: {FORBIDDEN_MUTATION} foi alterado.')

    print(f'Supabase JS fixado em {VERSION}.')
    print(f'Marcador de cache: {TOKEN}.')
    print(f'JS no fechamento transitivo: {len(changed_js)}.')
    print(f'Referências reescritas: {len(rewrites)}.')
    print(f'Arquivos alterados: {len(changed_files)}.')
    for source in sorted(changed_files):
        print(f'CHANGED {source}')

    if not changed_files:
        print('Nenhuma alteração necessária; árvore já está sincronizada.')


if __name__ == '__main__':
    main()
