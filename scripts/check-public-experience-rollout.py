#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
failures = []

required_files = [
    'js/module-public-shell.js',
    'css/classes-experience.css', 'js/classes-experience.js', 'classes.html',
    'css/compositions-experience.css', 'js/compositions-experience-v3.js', 'composicoes.html',
    'css/equipamentos-base.css', 'css/equipments-experience.css', 'css/equipments-showcase-data.css', 'js/equipments-experience.js', 'equipamentos.html',
    'css/editorial-experience.css', 'guias.html', 'noticias.html', 'tier-list.html',
    'css/statistics-experience.css', 'js/statistics-experience.js', 'js/statistics-experience-core.js', 'js/statistics-cms-bridge.js', 'estatisticas.html',
    'css/builds-hub-experience.css', 'js/builds-hub-experience.js', 'builds.html',
    'js/heroes-media-compat.js', 'herois.html',
]
for rel in required_files:
    if not (ROOT / rel).exists():
        failures.append(f'arquivo ausente: {rel}')

if not failures:
    html_names = ['herois.html','classes.html','composicoes.html','equipamentos.html','guias.html','noticias.html','tier-list.html','estatisticas.html','builds.html']
    files = {name: (ROOT / name).read_text(encoding='utf-8') for name in html_names}
    class_js = (ROOT / 'js/classes-experience.js').read_text(encoding='utf-8')
    composition_js = (ROOT / 'js/compositions-experience-v3.js').read_text(encoding='utf-8')
    equipment_js = (ROOT / 'js/equipments-experience.js').read_text(encoding='utf-8')
    statistics_wrapper = (ROOT / 'js/statistics-experience.js').read_text(encoding='utf-8')
    statistics_core = (ROOT / 'js/statistics-experience-core.js').read_text(encoding='utf-8')
    statistics_js = statistics_wrapper + '\n' + statistics_core
    builds_js = (ROOT / 'js/builds-hub-experience.js').read_text(encoding='utf-8')
    hero_media_js = (ROOT / 'js/heroes-media-compat.js').read_text(encoding='utf-8')

    checks = {
        'herois.html': ['./js/heroes-media-compat.js?v=20260821-media-4'],
        'classes.html': ['id="class-explorer"','id="class-experience-pills"','./css/classes-experience.css?v=20260821-experience-1','./js/classes-experience.js?v=20260821-experience-1','./js/module-public-shell.js?v=20260822-beta-module-4&amp;active=classes'],
        'composicoes.html': ['class="composition-explorer"','id="strategy-slot-1"','id="strategy-slot-2"','id="strategy-slot-3"','./js/composition-transactional-save.js?v=1','./css/compositions-experience.css?v=20260821-synergy-1','./js/compositions-experience-v3.js?v=20260827-brain-runtime-1','./js/module-public-shell.js?v=20260822-beta-module-4&amp;active=composicoes'],
        'equipamentos.html': ['id="equipment-explorer"','id="equipment-feature-art"','id="equipment-attribute-cards"','id="equipment-hud-attributes"','id="equipment-hud-class"','./css/equipamentos-base.css?v=20260916-equipment-verification-v1','./css/equipments-experience.css?v=20260821-holographic-2','./css/equipments-showcase-data.css?v=20260821-divino-1','./js/equipments-experience.js?v=20260916-equipment-verification-v1','./js/equipamentos-data-limits.js?v=4','./js/public-header-sync.js?v=20260822-beta-nav-5&amp;active=equipamentos&amp;mode=site-shell'],
        'guias.html': ['class="guides-auth-pending"','noindex,nofollow,noarchive','class="editorial-explorer"','Sem conteúdo de preenchimento','./css/editorial-experience.css?v=20260821-experience-1','./js/admin-guides-access.js?v=20260822-drawer-unified-1'],
        'noticias.html': ['Echo Pulse','Em breve','restrito ao painel administrativo','./js/module-public-shell.js?v=20260822-beta-module-4&amp;active=noticias'],
        'tier-list.html': ['class="editorial-explorer"','Sem ranking inventado','./css/editorial-experience.css?v=20260821-experience-1','./js/module-public-shell.js?v=20260822-beta-module-4&amp;active=tier-list'],
        'estatisticas.html': ['class="stats-explorer"','id="hero-ranking"','id="build-ranking"','id="class-distribution"','id="slot-distribution"','./css/statistics-experience.css?v=20260821-intelligence-1','./js/statistics-experience.js?v=20260822-statistics-wrapper-2','./js/module-public-shell.js?v=20260822-beta-module-4&amp;active=estatisticas','O painel mostra o que existe. Não preenche o que falta.'],
        'builds.html': ['class="builds-explorer"','id="builds-preview-stack"','id="builds-grid"','./css/builds-hub-experience.css?v=20260905-institutional-scout-exclusion-v2-1','./js/builds-hub-experience.js?v=20260905-institutional-scout-exclusion-v2-1','./js/module-public-shell.js?v=20260822-beta-module-4&amp;active=builds','./criar-build.html'],
    }
    for name, tokens in checks.items():
        for token in tokens:
            if token not in files[name]:
                failures.append(f'{name} sem integração esperada: {token}')

    for token in ("supabase.from('hero_classes')", "supabase.from('v_heroes_complete')"):
        if token not in class_js: failures.append(f'Classes sem fonte real: {token}')
    for token in ("supabase.from('team_compositions')", "supabase.from('team_synergies')", "supabase.from('heroes')", "supabase.from('hero_skills')"):
        if token not in composition_js: failures.append(f'Composições sem fonte real: {token}')
    for token in ("supabase.from('equipments')", "supabase.from('equipment_slots')", "supabase.from('equipment_sets')", "supabase.from('equipment_rarity_levels')", "supabase.from('equipment_variants')", "supabase.from('hero_classes')"):
        if token not in equipment_js: failures.append(f'Equipamentos sem fonte real: {token}')
    for token in ('equipment-attribute-cards', 'equipment-hud-attributes', 'equipment-hud-class', 'state.sources.variants', 'state.sources.classes', "slug === 'divino'"):
        if token not in equipment_js: failures.append(f'Equipamentos sem sincronização útil do showcase Divino: {token}')
    for token in ("supabase.from('v_heroes_complete')", "supabase.from('v_popular_builds')", "supabase.from('equipments')", "supabase.from('equipment_slots')", "supabase.from('team_compositions')", 'card_source', 'main_source'):
        if token not in statistics_js: failures.append(f'Estatísticas sem fonte real/contrato atual: {token}')
    for token in ("supabase.from('v_popular_builds')", "supabase.from('builds')", "supabase.from('v_heroes_complete')"):
        if token not in builds_js: failures.append(f'Hub de Builds sem fonte real: {token}')
    for token in ("supabase\n    .from('v_heroes_complete')", 'main_source', 'card_source', "dataset.mediaCompat = 'direct-source'"):
        if token not in hero_media_js: failures.append(f'Compatibilidade de mídia de Heróis incompleta: {token}')

    invalid_view_fields = ('card_image_path','card_image_url','image_path','image_url')
    hero_query = builds_js.split("supabase.from('v_heroes_complete')", 1)[-1]
    hero_query = hero_query.split(')', 1)[0] if hero_query else ''
    for token in invalid_view_fields:
        if token in hero_query:
            failures.append(f'Hub de Builds voltou a pedir coluna inexistente da view: {token}')

    for token in ('function hasCount(value)', 'value!==null', 'function heroMedia(hero){const item=hero||{}'):
        if token not in builds_js:
            failures.append(f'Hub de Builds sem proteção contra null/loading: {token}')

    if './js/module-public-shell.js' in files['guias.html']:
        failures.append('Guias carrega o shell público antes de validar o administrador')

    forbidden = ('19 heróis','76 habilidades','melhor composição','melhor trio','recomendado #1')
    for rel, text in [
        ('js/classes-experience.js', class_js),
        ('js/compositions-experience-v3.js', composition_js),
        ('js/equipments-experience.js', equipment_js),
        ('js/statistics-experience-core.js', statistics_js),
        ('js/builds-hub-experience.js', builds_js),
        ('js/heroes-media-compat.js', hero_media_js),
    ]:
        for token in forbidden:
            if token.lower() in text.lower():
                failures.append(f'{rel} contém dado/recomendação hardcoded: {token}')

    for rel in ('guias.html','noticias.html','tier-list.html'):
        text = files[rel].lower()
        for token in ('exemplo publicado','conteúdo demonstrativo','tier s — slayer'):
            if token in text:
                failures.append(f'{rel} contém conteúdo editorial fictício: {token}')

    if "state.errors" not in statistics_js or "'—'" not in statistics_js:
        failures.append('Estatísticas perdeu tratamento explícito de fontes indisponíveis')
    if "state.errors" not in builds_js or "'—'" not in builds_js:
        failures.append('Hub de Builds perdeu tratamento explícito de fontes indisponíveis')

if failures:
    print(f'Rollout visual público falhou com {len(failures)} problema(s):', file=sys.stderr)
    for failure in failures:
        print(f'- {failure}', file=sys.stderr)
    raise SystemExit(1)

print('Rollout visual: módulos públicos + Composições v3 + Echo Pulse privado/Em breve + showcase Divino de Equipamentos + Central de Estatísticas core/CMS validados sem conteúdo inventado.')
