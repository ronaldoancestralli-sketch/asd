#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
failures = []

polish = (ROOT / 'js/public-modules-polish.js').read_text(encoding='utf-8')
tier = (ROOT / 'tier-list.html').read_text(encoding='utf-8')
classes = (ROOT / 'classes.html').read_text(encoding='utf-8')
compositions = (ROOT / 'composicoes.html').read_text(encoding='utf-8')
guides_access = (ROOT / 'js/admin-guides-access.js').read_text(encoding='utf-8')

CACHE_VERSION = '20260823-public-modules-freeze-hotfix-1'


def require(text, token, label):
    if token not in text:
        failures.append(f'{label}: contrato ausente: {token}')


def forbid(text, token, label):
    if token in text:
        failures.append(f'{label}: padrão proibido voltou: {token}')


require(polish, "const grid = document.getElementById('module-grid');", 'public-modules-polish')
require(polish, 'function setText(target, value)', 'public-modules-polish')
require(polish, 'function setHtml(target, value)', 'public-modules-polish')
require(polish, 'function setAttributeValue(target, name, value)', 'public-modules-polish')
require(polish, 'if (target && target.textContent !== value)', 'public-modules-polish')
require(polish, 'if (target && target.innerHTML !== value)', 'public-modules-polish')
require(polish, 'if (target && target.getAttribute(name) !== value)', 'public-modules-polish')
require(polish, 'new MutationObserver(scheduleRefresh)', 'public-modules-polish')
require(polish, 'observer.observe(grid, { childList:true, subtree:true });', 'public-modules-polish')
require(polish, 'window.requestAnimationFrame', 'public-modules-polish')
require(polish, "document.addEventListener('echo:content-applied', scheduleRefresh)", 'public-modules-polish')

for forbidden_target in (
    "observer.observe(document.querySelector('.module-shell')",
    'observer.observe(document.body',
    'observer.observe(document.documentElement',
    "observer.observe(document.querySelector('.module-shell') || document.body",
):
    forbid(polish, forbidden_target, 'public-modules-polish')

for label, text in (
    ('tier-list.html', tier),
    ('classes.html', classes),
    ('composicoes.html', compositions),
    ('admin-guides-access.js', guides_access),
):
    require(text, f'public-modules-polish.js?v={CACHE_VERSION}', label)

if failures:
    print(f'Runtime dos módulos públicos falhou com {len(failures)} problema(s):', file=sys.stderr)
    for failure in failures:
        print(f'- {failure}', file=sys.stderr)
    raise SystemExit(1)

print('Runtime público validado: observer restrito ao grid, escritas idempotentes e cache-busting sincronizado.')
