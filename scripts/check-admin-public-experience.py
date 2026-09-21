#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
failures = []

required = [
    'css/heroes-card-media-fix.css',
    'admin/css/admin-public-experience.css',
    'admin/css/admin-dashboard-experience.css',
    'admin/js/public-experience.js',
    'admin/js/public-experience-sync-audit.js',
    'admin/js/heroes.js',
    'admin/js/heroes-public-parity.js',
    'admin/js/site-content-premium-schema.js',
    'admin/js/site-content-premium-schema-core.js',
    'admin/js/site-content-final-sync.js',
    'admin/js/site-content-deeplink.js',
    'admin/public-experience.html',
    'admin/site-content.html',
    'admin/index.html',
    'admin/heroes.html',
    'admin/builds.html',
    'admin/equipments.html',
    'js/heroes-page-media.js',
    'scripts/check-admin-public-sync.py',
]
for rel in required:
    if not (ROOT / rel).exists():
        failures.append(f'arquivo ausente: {rel}')

if not failures:
    hero_html = (ROOT / 'herois.html').read_text(encoding='utf-8')
    builds_html = (ROOT / 'builds.html').read_text(encoding='utf-8')
    media_css = (ROOT / 'css/heroes-card-media-fix.css').read_text(encoding='utf-8')
    page_media = (ROOT / 'js/heroes-page-media.js').read_text(encoding='utf-8')
    admin_center = (ROOT / 'admin/public-experience.html').read_text(encoding='utf-8')
    admin_controller = (ROOT / 'admin/js/public-experience.js').read_text(encoding='utf-8')
    sync_audit = (ROOT / 'admin/js/public-experience-sync-audit.js').read_text(encoding='utf-8')
    admin_heroes_controller = (ROOT / 'admin/js/heroes.js').read_text(encoding='utf-8')
    hero_parity = (ROOT / 'admin/js/heroes-public-parity.js').read_text(encoding='utf-8')
    premium_schema = '\n'.join((ROOT / rel).read_text(encoding='utf-8') for rel in (
        'admin/js/site-content-premium-schema.js',
        'admin/js/site-content-premium-schema-core.js',
        'admin/js/site-content-final-sync.js',
    ))
    deeplink = (ROOT / 'admin/js/site-content-deeplink.js').read_text(encoding='utf-8')
    site_content_admin = (ROOT / 'admin/site-content.html').read_text(encoding='utf-8')
    dashboard = (ROOT / 'admin/index.html').read_text(encoding='utf-8')
    admin_heroes = (ROOT / 'admin/heroes.html').read_text(encoding='utf-8')
    admin_builds = (ROOT / 'admin/builds.html').read_text(encoding='utf-8')
    admin_equipments = (ROOT / 'admin/equipments.html').read_text(encoding='utf-8')

    for token in (
        './css/heroes-card-media-fix.css?v=20260821-media-3',
        './js/heroes-media-compat.js?v=20260821-media-4',
        './js/heroes-page-media.js?v=20260821-page-media-3',
    ):
        if token not in hero_html:
            failures.append(f'herois.html sem correção/mídia esperada: {token}')

    for token in ('.hc .thumb .media', 'position:absolute', 'height:100%', 'min-height:100%'):
        if token not in media_css:
            failures.append(f'correção estrutural dos cards de Heróis ausente: {token}')

    for token in ('heroes_all_feature_image','heroes_all_card_image',"heroKey('featured'", "heroKey('roster'",'classKey(slug)','echo:content-applied'):
        if token not in page_media:
            failures.append(f'consumidor de mídia exclusiva de Heróis incompleto: {token}')

    common_admin_tokens = ('./css/admin-public-experience.css?v=20260821-admin-experience-1','data-admin-experience="true"','./public-experience.html')
    for name, text in (('admin/index.html',dashboard),('admin/heroes.html',admin_heroes),('admin/builds.html',admin_builds),('admin/equipments.html',admin_equipments)):
        for token in common_admin_tokens:
            if token not in text: failures.append(f'{name} sem integração Admin↔Público: {token}')

    required_ids = {
        'admin/index.html':['metric-heroes','metric-equipments','metric-builds','metric-users','metric-comments','metric-blocked','recent-heroes','recent-equipments','recent-builds','recent-comments','dashboard-message'],
        'admin/heroes.html':['hero-admin-active','hero-admin-media','hero-admin-skills','hero-admin-blocked','hero-parity-status','search','status-filter','sort-filter','message','heroes-list'],
        'admin/builds.html':['refresh','summary-total','summary-public','summary-featured','summary-deleted','summary-recent','context-bar','context-label','search','status-filter','hero-filter','sort-filter','page-size','message','builds-list','pagination-info','prev-page','next-page'],
        'admin/equipments.html':['search','set-filter','slot-filter','message','equipment-list'],
    }
    file_map={'admin/index.html':dashboard,'admin/heroes.html':admin_heroes,'admin/builds.html':admin_builds,'admin/equipments.html':admin_equipments}
    for name, ids in required_ids.items():
        for element_id in ids:
            if f'id="{element_id}"' not in file_map[name]: failures.append(f'{name} perdeu ID funcional existente: {element_id}')

    for token in ("supabase.from('heroes')","supabase.from('v_heroes_complete')","supabase.from('hero_skills')","count('builds'","count('equipments'","count('team_compositions'","count('site_pages'","count('site_content'","count('guides'","count('news'","count('tier_lists'","column='id'",'main_source','card_source',"moduleState('ax-module-cms'",'Dados dinâmicos continuam nos módulos próprios.'):
        if token not in admin_controller: failures.append(f'Central de Experiência Pública sem fonte/contrato real esperado: {token}')

    for token in ("supabase.from('site_pages')","supabase.from('site_content')",'LEGACY_CONTENT_KEYS',"['compare', new Set(['hero_art'])]",'Chaves sem controle correspondente no Admin','site_content legado','schema.fieldKeys.has(key)'):
        if token not in sync_audit: failures.append(f'Auditoria editorial viva sem contrato esperado: {token}')

    for token in ("supabase.from('v_heroes_complete')","supabase.from('hero_skills')",'loadHeroPublicParityData','heroesById','skillCountsByHero','mergeHeroPublicState','main_source','card_source'):
        if token not in hero_parity: failures.append(f'Paridade Admin de Heróis incompleta: {token}')
    for forbidden in ('MutationObserver','patchCard(','requestAnimationFrame(patchAll)'):
        if forbidden in hero_parity: failures.append(f'Paridade Admin de Heróis voltou a depender de patch pós-render: {forbidden}')

    for token in ("./heroes-public-parity.js?v=20260821-admin-experience-2",'loadHeroPublicParityData()','mergeHeroPublicState(hero, parityResult.data)','hero.card_source || hero.main_source','publicParityMarkup(hero)','data-public-preview','data-public-media=','updateParityMetrics()','Paridade direta ativa'):
        if token not in admin_heroes_controller: failures.append(f'Admin de Heróis sem renderização pública direta esperada: {token}')
    for token in ('./js/heroes.js?v=20260830-compact-roster-1','Validando leitura direta da mesma mídia pública'):
        if token not in admin_heroes: failures.append(f'admin/heroes.html sem cache/estado de paridade direta: {token}')
    if "await import('./js/heroes-public-parity.js" in admin_heroes: failures.append('admin/heroes.html voltou a carregar paridade como patch separado pós-render')

    for forbidden in ('19 heróis','76 habilidades','9 builds','7 equipamentos','melhor composição','trio recomendado'):
        if forbidden.lower() in admin_controller.lower(): failures.append(f'Central Admin contém dado/recomendação hardcoded: {forbidden}')

    for name,text in (('admin/heroes.html',admin_heroes),('admin/builds.html',admin_builds),('admin/equipments.html',admin_equipments)):
        if '../' not in text or 'target="_blank"' not in text: failures.append(f'{name} perdeu acesso explícito à superfície pública')

    for token in ('./css/admin-public-experience.css?v=20260821-admin-experience-1','./js/public-experience.js?v=20260821-admin-experience-2','./js/public-experience-sync-audit.js?v=20260822-admin-public-sync-2','id="ax-module-cms"','href="./site-content.html"','CMS / SEO','dados dinâmicos continuam nos módulos próprios','id="ax-hero-list"','id="ax-issues"'):
        if token not in admin_center: failures.append(f'Central Admin sem estrutura/governança esperada: {token}')

    for token in ("SITE_CONTENT_PAGES.find(page => page.key === 'heroes')","page.key === 'builds'","field('explorer_title'","field('classes_title'","field('public_title'","field('flow_title'","field('heroes_all_card_image'","field('heroes_all_feature_image'",'`heroes_class_${slug}_image`','`heroes_featured_${slug}`','`heroes_roster_${slug}`',".from('v_heroes_complete')",".from('hero_classes')"):
        if token not in premium_schema: failures.append(f'CMS premium sem campo/página esperada: {token}')

    # O entrypoint premium é wrapper; o contrato é provado pelo conjunto wrapper+core+sync final.
    for token in ('./js/site-content-premium-schema.js?v=20260829-schema-reconcile-1','./js/site-content-deeplink.js?v=1','./css/admin-public-experience.css?v=20260821-admin-experience-1','data-admin-experience="true"','Conteúdo público sob controle do Admin'):
        if token not in site_content_admin: failures.append(f'Editor Conteúdo do site sem integração premium: {token}')

    for token in ("params.get('page')","params.get('tab')",'data-editor-tab','MutationObserver'):
        if token not in deeplink: failures.append(f'Deeplink do editor sem navegação direta esperada: {token}')

    for token in ('data-cms-text="explorer_title"','data-cms-text="explorer_accent"','data-cms-text="classes_title"','data-cms-text="featured_open_button"'):
        if token not in hero_html: failures.append(f'Heróis premium sem binding CMS: {token}')
    for token in ('data-cms-page="builds"','data-cms-text="explorer_title"','data-cms-text="public_title"','data-cms-text="flow_title"','./js/site-content.js?v=20260822-drawer-unified-1'):
        if token not in builds_html: failures.append(f'Hub de Builds sem binding CMS: {token}')

    if not (ROOT/'js/game-stat-engine.js').exists(): failures.append('game-stat-engine.js ausente')

if failures:
    print(f'Paridade Admin↔Público falhou com {len(failures)} problema(s):',file=sys.stderr)
    for failure in failures: print(f'- {failure}',file=sys.stderr)
    raise SystemExit(1)
print('Paridade Admin↔Público validada: wrapper+core do CMS, mídia direta/editorial de Heróis, auditoria viva, módulos dinâmicos e IDs funcionais preservados.')
