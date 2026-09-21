#!/usr/bin/env python3
from pathlib import Path
import json
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
failures = []
notes = []

required = [
    'versoes.html','sobre.html','suporte.html',
    'js/public-beta-banner.js','css/public-beta-banner.css','css/public-trust-pages.css',
    'js/public-versions.js','js/public-release-manifest.js','js/public-support.js','js/admin-guides-access.js',
    'admin/releases.html','admin/js/releases.js',
    'js/module-public-shell-core.js','js/public-header-sync-core.js','js/site-shell-core.js','admin/js/admin-shell-core.js'
]
for rel in required:
    if not (ROOT / rel).exists(): failures.append(f'arquivo obrigatório ausente: {rel}')

if not failures:
    navigation = (ROOT/'js/public-navigation.js').read_text(encoding='utf-8')
    beta = (ROOT/'js/public-beta-banner.js').read_text(encoding='utf-8')
    versions = (ROOT/'js/public-versions.js').read_text(encoding='utf-8')
    manifest = (ROOT/'js/public-release-manifest.js').read_text(encoding='utf-8')
    support = (ROOT/'js/public-support.js').read_text(encoding='utf-8')
    about = (ROOT/'sobre.html').read_text(encoding='utf-8')
    versions_html = (ROOT/'versoes.html').read_text(encoding='utf-8')
    support_html = (ROOT/'suporte.html').read_text(encoding='utf-8')
    releases_admin = (ROOT/'admin/js/releases.js').read_text(encoding='utf-8')
    release_admin_html = (ROOT/'admin/releases.html').read_text(encoding='utf-8')
    ledger_entries = []
    try:
        ledger_entries = [
            json.loads(line) for line in (ROOT/'docs/CHANGELOG_INTERNAL.jsonl').read_text(encoding='utf-8').splitlines()
            if line.strip()
        ]
    except (OSError, json.JSONDecodeError) as error:
        failures.append(f'ledger público inválido: {error}')

    for forbidden in ('github.com/BPC-MGA/EchoArena','api.github.com/repos/BPC-MGA/EchoArena','raw.githubusercontent.com/BPC-MGA/EchoArena','/commits/main','issues/new?'):
        if forbidden.lower() in navigation.lower(): failures.append(f'navegação pública ainda expõe destino técnico: {forbidden}')
    for token in (
        "['versoes', '↻', 'Versões & evolução'",
        "'./versoes.html'",
        "['sobre', '◎', 'Sobre o Echo Arena'",
        "'./sobre.html'",
        "'./suporte.html?tipo=contato'",
        "'./suporte.html?tipo=problema'",
        "./public-beta-banner.js?v=20260822-beta-1",
    ):
        if token not in navigation: failures.append(f'navegação pública sem contrato seguro: {token}')

    for token in ('BETA','Acesso antecipado','Em desenvolvimento','site_pages',".eq('page_key', VERSION_PAGE)",'./versoes.html','@media(max-width:720px)','@media(prefers-reduced-motion:reduce)'):
        source = beta + '\n' + (ROOT/'css/public-beta-banner.css').read_text(encoding='utf-8')
        if token not in source: failures.append(f'aviso Beta incompleto: {token}')

    for token in (".from('site_pages')",".eq('page_key', 'versions')",'current_version','release-timeline','highlights',"PUBLIC_KINDS = new Set(['beta', 'feature', 'improvement', 'fix', 'content'])",'isPublicRelease','PUBLIC_RELEASE_MANIFEST'):
        if token not in versions + versions_html + manifest: failures.append(f'Histórico público incompleto: {token}')
    if "security: 'Segurança'" in versions:
        failures.append('Histórico público ainda possui categoria explícita de segurança')
    manifest_versions = re.findall(r"version:\s*'([^']+)'", manifest)
    suppressed_versions = {
        version
        for entry in ledger_entries
        for version in entry.get('supersedes_public_versions', [])
    }
    ledger_versions = [
        entry.get('public_version')
        for entry in ledger_entries
        if entry.get('public') is True
        and entry.get('public_version')
        and entry.get('public_version') not in suppressed_versions
    ]
    if not manifest_versions:
        failures.append('manifesto público não contém versões')
    else:
        if len(manifest_versions) != len(set(manifest_versions)):
            failures.append('manifesto público contém versões duplicadas')
        missing = sorted(set(ledger_versions) - set(manifest_versions))
        unexpected = sorted(set(manifest_versions) - set(ledger_versions))
        if missing:
            failures.append('releases públicas do ledger ausentes no manifesto: ' + ', '.join(missing))
        if unexpected:
            failures.append('releases do manifesto sem registro público efetivo: ' + ', '.join(unexpected))
        if ledger_versions and manifest_versions[0] != ledger_versions[-1]:
            failures.append(
                f'manifesto abre em {manifest_versions[0]}, mas o ledger público atual é {ledger_versions[-1]}'
            )
    if 'public-versions.js?v=20260830-release-057-1' not in versions_html:
        failures.append('versoes.html não atualizou o cache-busting do histórico público atual')
    version_from_manifest = "PUBLIC_RELEASE_MANIFEST.find(release => release?.published !== false)?.version"
    if version_from_manifest not in beta or version_from_manifest not in versions:
        failures.append('banner e histórico não derivam a versão atual do manifesto público')
    for forbidden in ('github.com','api.github.com','raw.githubusercontent','commit_sha','head_sha','branch_name'):
        if forbidden.lower() in (versions + versions_html + manifest + about + support + support_html).lower(): failures.append(f'superfície pública de confiança contém detalhe proibido: {forbidden}')

    for token in (".from('system_settings')","select('contact_email')",'mailto:','support-form','tipo='):
        if token not in support + support_html + navigation: failures.append(f'central de suporte incompleta: {token}')

    for token in (".from('site_pages')",".eq('page_key','versions')",'current_version','releases','original_version','Visível no histórico público','data-release-governance="v1"','SEM VERSÃO PÚBLICA'):
        if token not in releases_admin + release_admin_html: failures.append(f'Admin de versões incompleto: {token}')

    wrappers = {
        'js/public-header-sync.js':'./public-beta-banner.js?v=20260822-beta-1',
        'js/module-public-shell.js':'./public-beta-banner.js?v=20260822-beta-1',
        'js/site-shell.js':'./public-beta-banner.js?v=20260822-beta-1',
    }
    for rel, token in wrappers.items():
        text=(ROOT/rel).read_text(encoding='utf-8')
        if token not in text: failures.append(f'{rel} não carrega o aviso Beta')

    covered_entrypoints = (
        'js/public-beta-banner.js','js/public-header-sync.js','js/module-public-shell.js','js/site-shell.js',
        'js/app.js','js/criar-build.js','js/public-modules.js','js/admin-guides-access.js'
    )
    skipped = {'maintenance.html','hero-editor.html','admin-echo-pulse.html'}
    for html in sorted(ROOT.glob('*.html')):
        if html.name in skipped: continue
        text=html.read_text(encoding='utf-8',errors='ignore')
        if not any(token in text for token in covered_entrypoints):
            failures.append(f'{html.name}: nenhuma casca conhecida garante o aviso Beta')

    public_files = list(ROOT.glob('*.html')) + list((ROOT/'js').glob('*.js'))
    exposed=[]
    for path in public_files:
        text=path.read_text(encoding='utf-8',errors='ignore').lower()
        if 'github.com' in text or 'api.github.com' in text or 'raw.githubusercontent.com' in text:
            exposed.append(path.relative_to(ROOT).as_posix())
    allowed_legacy={'js/admin.js'}
    unexpected=[p for p in exposed if p not in allowed_legacy]
    if unexpected: failures.append('referências ao repositório ainda acessíveis em HTML/JS público: '+', '.join(sorted(unexpected)))
    if exposed: notes.append('Referências técnicas restantes fora da navegação pública: '+', '.join(sorted(exposed)))

    placeholder_links=[]
    for path in sorted(ROOT.glob('*.html')):
        if path.name in skipped: continue
        text=path.read_text(encoding='utf-8',errors='ignore')
        if re.search(r'''href\s*=\s*["']#["']''', text, re.IGNORECASE):
            placeholder_links.append(path.name)
    if placeholder_links:
        failures.append('HTML público contém links acionáveis sem destino (href="#"): '+', '.join(placeholder_links))

    if not (ROOT/'js/game-stat-engine.js').exists(): failures.append('js/game-stat-engine.js ausente')

for note in notes: print('INFO:',note)
if failures:
    print(f'PUBLIC BETA/HISTORY SECURITY GATE: FALHOU com {len(failures)} problema(s)')
    for failure in failures: print('-',failure)
    sys.exit(1)
print('PUBLIC BETA/HISTORY SECURITY GATE: OK · Beta global, manifesto de releases, histórico sanitizado, suporte interno e navegação sem repositório técnico.')
