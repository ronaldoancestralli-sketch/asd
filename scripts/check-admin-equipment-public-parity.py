#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
admin_js_path = ROOT / 'admin' / 'js' / 'equipments.js'
admin_html_path = ROOT / 'admin' / 'equipments.html'
public_js_path = ROOT / 'js' / 'equipments-experience.js'
failures = []

for path in (admin_js_path, admin_html_path, public_js_path):
    if not path.exists():
        failures.append(f'arquivo obrigatório ausente: {path.relative_to(ROOT)}')

if not failures:
    admin_js = admin_js_path.read_text(encoding='utf-8')
    admin_html = admin_html_path.read_text(encoding='utf-8')
    public_js = public_js_path.read_text(encoding='utf-8')

    required_public_contract = (
        "supabase.from('equipments')",
        ".eq('enabled',true)",
        "item?.image_path||item?.image_url||''",
        "supabase.from('equipment_rarity_levels')",
    )
    for token in required_public_contract:
        if token not in public_js:
            failures.append(f'página pública de Equipamentos sem contrato esperado: {token}')

    required_admin_contract = (
        'item.enabled === true',
        'item.image_path || item.image_url ||',
        "supabase\n    .from('equipment_rarity_levels')",
        'rarityLevelsAvailable',
        'rarityLevelsError',
        'rarityLevelCounts',
        "selectedStatus === 'active' && publicItem",
        "selectedStatus === 'inactive' && !publicItem",
        'data-public-media=',
        'publicParityMarkup(item)',
        'data-public-preview',
        "setMetric('equipment-admin-total'",
        "setMetric('equipment-admin-active'",
        "setMetric('equipment-admin-media'",
        "setMetric('equipment-admin-levels'",
    )
    for token in required_admin_contract:
        if token not in admin_js:
            failures.append(f'Admin de Equipamentos sem paridade pública esperada: {token}')

    for token in (
        'id="equipment-admin-total"',
        'id="equipment-admin-active"',
        'id="equipment-admin-media"',
        'id="equipment-admin-levels"',
        'id="equipment-parity-status"',
        'id="status-filter"',
        'image_path || image_url',
        './js/equipments.js?v=20260821-admin-experience-2',
    ):
        if token not in admin_html:
            failures.append(f'admin/equipments.html sem estado/cache de paridade esperado: {token}')

    for forbidden in ('7 equipamentos', '6 com mídia', '0 níveis'):
        if forbidden.lower() in admin_js.lower() or forbidden.lower() in admin_html.lower():
            failures.append(f'Admin de Equipamentos contém contagem hardcoded: {forbidden}')

    if "rarityLevelsAvailable = Boolean(rarityResult.data)" not in admin_js:
        failures.append('Admin de Equipamentos não distingue indisponibilidade da consulta de níveis')

    if "setMetric('equipment-admin-levels', null)" not in admin_js:
        failures.append('Admin de Equipamentos pode converter falha de níveis em contagem válida')

if failures:
    print(f'Paridade Admin de Equipamentos falhou com {len(failures)} problema(s):', file=sys.stderr)
    for failure in failures:
        print(f'- {failure}', file=sys.stderr)
    raise SystemExit(1)

print('Admin de Equipamentos: status público, mídia, níveis de raridade e cache-busting validados sem dados inventados.')
