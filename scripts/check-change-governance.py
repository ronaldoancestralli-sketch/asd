#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOG_REL = 'docs/CHANGELOG_INTERNAL.jsonl'
LOG = ROOT / LOG_REL
MANIFEST_REL = 'js/public-release-manifest.js'
PUBLIC_CATEGORIES = {'beta', 'feature', 'improvement', 'fix', 'content'}
VERSION_IMPACTS = {'none', 'patch', 'minor', 'major', 'baseline'}
PUBLIC_SYNC = {'synced', 'not_required'}
SEMVER = re.compile(r'^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$')
ZERO_SHA = '0' * 40
failures: list[str] = []


def parse_date(value: str) -> datetime:
    value = value.strip()
    if re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
        return datetime.fromisoformat(value)
    return datetime.fromisoformat(value.replace('Z', '+00:00'))


def semver_core(value: str) -> tuple[int, int, int]:
    match = SEMVER.fullmatch(value or '')
    if not match:
        raise ValueError(value)
    return tuple(int(match.group(i)) for i in (1, 2, 3))


def read_entries(text: str, label: str) -> list[dict]:
    entries: list[dict] = []
    for lineno, raw in enumerate(text.splitlines(), start=1):
        if not raw.strip():
            continue
        try:
            item = json.loads(raw)
        except json.JSONDecodeError as error:
            failures.append(f'{label}:{lineno}: JSON inválido: {error.msg}')
            continue
        if not isinstance(item, dict):
            failures.append(f'{label}:{lineno}: entrada deve ser objeto JSON')
            continue
        entries.append(item)
    return entries


def validate_entries(entries: list[dict]) -> None:
    required = {
        'id', 'occurred_at', 'area', 'change_type', 'title', 'summary',
        'user_visible', 'public', 'public_version', 'public_category',
        'public_note', 'version_impact', 'public_sync', 'security_sensitive',
        'backend_only', 'source_ref'
    }
    ids: set[str] = set()
    public_versions: set[str] = set()
    previous_date: datetime | None = None
    seen_public = False

    for index, item in enumerate(entries, start=1):
        missing = sorted(required - set(item))
        if missing:
            failures.append(f'entrada {index}: campos ausentes: {", ".join(missing)}')
            continue
        entry_id = str(item.get('id') or '').strip()
        if not entry_id or entry_id in ids:
            failures.append(f'entrada {index}: id vazio ou duplicado: {entry_id!r}')
        ids.add(entry_id)
        try:
            occurred = parse_date(str(item.get('occurred_at') or ''))
            if previous_date and occurred < previous_date:
                failures.append(f'{entry_id}: log não está em ordem cronológica')
            previous_date = occurred
        except Exception:
            failures.append(f'{entry_id}: occurred_at inválido')

        for key in ('area', 'change_type', 'title', 'summary'):
            if not str(item.get(key) or '').strip():
                failures.append(f'{entry_id}: {key} não pode ser vazio')
        for key in ('user_visible', 'public', 'security_sensitive', 'backend_only'):
            if not isinstance(item.get(key), bool):
                failures.append(f'{entry_id}: {key} deve ser booleano')

        impact = item.get('version_impact')
        if impact not in VERSION_IMPACTS:
            failures.append(f'{entry_id}: version_impact inválido: {impact!r}')
        if item.get('public_sync') not in PUBLIC_SYNC:
            failures.append(f'{entry_id}: public_sync inválido')

        is_public = item.get('public') is True
        user_visible = item.get('user_visible') is True
        security = item.get('security_sensitive') is True
        backend_only = item.get('backend_only') is True
        area = str(item.get('area') or '').lower()

        repair_version = item.get('repairs_public_version')
        if repair_version is not None:
            if is_public:
                failures.append(f'{entry_id}: reparo de release deve ser uma entrada interna')
            if not isinstance(repair_version, str) or not SEMVER.fullmatch(repair_version.strip()):
                failures.append(f'{entry_id}: repairs_public_version deve usar SemVer')

        if security and is_public:
            failures.append(f'{entry_id}: mudança de segurança não pode ser pública')
        if is_public and not user_visible:
            failures.append(f'{entry_id}: entrada pública precisa ser user_visible=true')
        if user_visible and not is_public:
            failures.append(f'{entry_id}: mudança percebida pelo usuário deve ser classificada como pública')

        if is_public:
            version = str(item.get('public_version') or '').strip()
            category = item.get('public_category')
            note = str(item.get('public_note') or '').strip()
            if not SEMVER.fullmatch(version):
                failures.append(f'{entry_id}: public_version deve usar SemVer')
            elif version in public_versions:
                failures.append(f'{entry_id}: public_version duplicada: {version}')
            public_versions.add(version)
            if category not in PUBLIC_CATEGORIES:
                failures.append(f'{entry_id}: categoria pública inválida: {category!r}')
            if len(note) < 20:
                failures.append(f'{entry_id}: public_note precisa explicar a mudança ao usuário')
            if item.get('public_sync') != 'synced':
                failures.append(f'{entry_id}: mudança pública só pode mergear com public_sync=synced')
            if impact == 'none':
                failures.append(f'{entry_id}: mudança pública precisa avançar versão')
            if impact == 'baseline' and seen_public:
                failures.append(f'{entry_id}: baseline só é permitida na primeira versão pública')
            if backend_only and area not in {'brain', 'calculation', 'calculo', 'motor-de-calculo'}:
                failures.append(f'{entry_id}: backend_only só pode ser público quando o efeito de Brain/cálculo é material para o usuário')
            seen_public = True
        else:
            if item.get('public_version') is not None:
                failures.append(f'{entry_id}: entrada interna deve ter public_version=null')
            if item.get('public_category') is not None:
                failures.append(f'{entry_id}: entrada interna deve ter public_category=null')
            if item.get('public_note') is not None:
                failures.append(f'{entry_id}: entrada interna deve ter public_note=null')
            if impact != 'none':
                failures.append(f'{entry_id}: entrada interna deve usar version_impact=none')
            if item.get('public_sync') != 'not_required':
                failures.append(f'{entry_id}: entrada interna deve usar public_sync=not_required')


def git(*args: str) -> str:
    return subprocess.check_output(['git', *args], cwd=ROOT, text=True, stderr=subprocess.DEVNULL).strip()


def base_for_enforcement() -> tuple[str | None, str]:
    source = os.getenv('CI_PIPELINE_SOURCE', '')
    head = os.getenv('CI_COMMIT_SHA') or 'HEAD'
    if source == 'merge_request_event':
        return os.getenv('CI_MERGE_REQUEST_DIFF_BASE_SHA'), head
    if os.getenv('CI_COMMIT_BRANCH') == 'main':
        return os.getenv('CI_COMMIT_BEFORE_SHA'), head
    return None, head


def relevant(path: str) -> bool:
    if path in {LOG_REL, 'docs/CHANGE_GOVERNANCE.md'}:
        return False
    if path in {'.gitlab-ci.yml', 'CNAME'}:
        return True
    if path.endswith('.html'):
        return True
    return path.startswith(('admin/', 'js/', 'css/', 'supabase/', 'cloudflare/', 'assets/', 'scripts/', '.github/workflows/'))


def is_public_surface(path: str) -> bool:
    # This internal prototype is excluded by collectPublishableFiles in the Pages builder.
    # Its HTML in Git does not publish a new player-facing release.
    if path.startswith('prototypes/calculation-v2/'):
        return False
    if path.startswith('admin/') or path.startswith(('js/admin-', 'css/admin-')):
        return False
    return path.endswith('.html') or path.startswith(('js/', 'css/'))


def is_admin_runtime(path: str) -> bool:
    return (
        path.startswith('admin/')
        or path.startswith(('js/admin-', 'css/admin-'))
        or path.startswith('supabase/functions/admin-')
    )


def is_support_file(path: str) -> bool:
    return path.startswith(('tests/', 'scripts/', 'docs/', '.github/'))


def base_log_entries(base: str) -> list[dict]:
    try:
        text = git('show', f'{base}:{LOG_REL}')
    except Exception:
        return []
    return read_entries(text, f'{base}:{LOG_REL}')


def enforce_diff(entries: list[dict]) -> None:
    base, head = base_for_enforcement()
    if not base or base == ZERO_SHA:
        return
    try:
        changed = [line for line in git('diff', '--name-only', base, head).splitlines() if line]
    except Exception:
        print('INFO: base do CI não está disponível localmente; validação estrutural do ledger foi mantida.')
        return
    relevant_changed = [path for path in changed if relevant(path)]
    if not relevant_changed:
        return
    if LOG_REL not in changed:
        failures.append('mudança relevante sem atualização de docs/CHANGELOG_INTERNAL.jsonl')
        return

    old_entries = base_log_entries(base)
    old_ids = {str(item.get('id')) for item in old_entries}
    new_entries = [item for item in entries if str(item.get('id')) not in old_ids]
    if not new_entries:
        failures.append('o ledger mudou, mas nenhuma entrada nova foi adicionada')
        return

    new_public = [item for item in new_entries if item.get('public') is True]
    public_surface_changed = [path for path in relevant_changed if is_public_surface(path)]
    runtime_changed = [path for path in relevant_changed if not is_support_file(path) and path != LOG_REL]
    admin_runtime_changed = [path for path in runtime_changed if is_admin_runtime(path)]
    non_admin_runtime_changed = [path for path in runtime_changed if not is_admin_runtime(path)]
    release_repairs = [
        item for item in new_entries
        if item.get('public') is False and item.get('repairs_public_version')
    ]
    valid_release_repair = False
    if release_repairs:
        if MANIFEST_REL not in changed:
            failures.append('reparo de release pública exige atualização do manifesto')
        elif set(public_surface_changed) != {MANIFEST_REL}:
            failures.append('reparo da mesma release só pode alterar o manifesto público')
        else:
            manifest = (ROOT / MANIFEST_REL).read_text(encoding='utf-8')
            try:
                old_manifest = git('show', f'{base}:{MANIFEST_REL}')
            except Exception:
                old_manifest = ''
            current_match = re.search(r"version:\s*'([^']+)'", manifest)
            previous_match = re.search(r"version:\s*'([^']+)'", old_manifest)
            repair_versions = {
                str(item.get('repairs_public_version') or '').strip()
                for item in release_repairs
            }
            valid_release_repair = (
                current_match is not None
                and previous_match is not None
                and current_match.group(1) == previous_match.group(1)
                and repair_versions == {current_match.group(1)}
            )
            if not valid_release_repair:
                failures.append(
                    'repairs_public_version precisa apontar para a versão atual, sem avançá-la'
                )

    if public_surface_changed and not new_public and not valid_release_repair:
        failures.append(
            'mudança em superfície pública sem release pública no ledger: '
            + ', '.join(public_surface_changed)
        )
    if admin_runtime_changed and not non_admin_runtime_changed and new_public:
        failures.append(
            'ajuste exclusivo do painel Admin não pode criar versão pública: '
            + ', '.join(admin_runtime_changed)
        )

    if new_public:
        if MANIFEST_REL not in changed:
            failures.append('release pública sem atualização de js/public-release-manifest.js')
        else:
            manifest = (ROOT / MANIFEST_REL).read_text(encoding='utf-8')
            for item in new_public:
                version = str(item.get('public_version') or '').strip()
                if version and f"version: '{version}'" not in manifest:
                    failures.append(f'{item.get("id")}: versão {version} ausente no manifesto público')

    old_public = [item for item in old_entries if item.get('public') is True and item.get('public_version')]
    if old_public:
        try:
            previous_core = semver_core(str(old_public[-1]['public_version']))
        except ValueError:
            previous_core = None
        for item in new_entries:
            if item.get('public') is not True:
                continue
            try:
                current_core = semver_core(str(item.get('public_version') or ''))
            except ValueError:
                continue
            if previous_core is not None and current_core <= previous_core:
                failures.append(
                    f"{item.get('id')}: versão pública {item.get('public_version')} não avança "
                    f"a versão anterior {old_public[-1].get('public_version')}"
                )
            previous_core = current_core

    print(f'CHANGE GOVERNANCE: {len(relevant_changed)} arquivo(s) relevante(s), {len(new_entries)} nova(s) entrada(s) no ledger.')


def main() -> int:
    if not LOG.exists():
        print(f'CHANGE GOVERNANCE GATE: FALHOU · {LOG_REL} ausente')
        return 1
    entries = read_entries(LOG.read_text(encoding='utf-8'), LOG_REL)
    validate_entries(entries)
    enforce_diff(entries)
    if failures:
        print(f'CHANGE GOVERNANCE GATE: FALHOU com {len(failures)} problema(s)')
        for failure in failures:
            print('-', failure)
        return 1
    public = [item for item in entries if item.get('public') is True]
    current = public[-1].get('public_version') if public else 'sem versão pública'
    print(f'CHANGE GOVERNANCE GATE: OK · {len(entries)} registro(s) interno(s) · versão pública {current}.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
