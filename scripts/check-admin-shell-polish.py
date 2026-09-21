#!/usr/bin/env python3
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
errors = []

def read(path):
    target = ROOT / path
    if not target.exists():
        errors.append(f'arquivo ausente: {path}')
        return ''
    return target.read_text(encoding='utf-8')

def require(text, token, label):
    if token not in text:
        errors.append(f'{label}: contrato ausente: {token}')

def forbid(text, token, label):
    if token in text:
        errors.append(f'{label}: padrão legado ainda presente: {token}')

shell_wrapper = read('admin/js/admin-shell.js')
shell_core = read('admin/js/admin-shell-core.js')
shell = shell_wrapper + '\n' + shell_core
hero_status = read('admin/hero-stats.html')
hero_status_js = read('admin/js/hero-status-overview.js')
equipment_import = read('admin/equipment-import.html')
equipment_import_js = read('admin/js/equipment-import.js')
equipment_ai = read('admin/equipment-ai-import.html')
equipment_ai_js = read('admin/js/equipment-ai-import.js')
equipments = read('admin/equipments.html')
equipment_editor = read('admin/equipment-editor.html')
equipment_editor_wrapper = read('admin/js/equipment-editor.js')
equipment_attribute_assistant = read('admin/js/equipment-attribute-assistant.js')
content_html = read('admin/content-modules.html')
content_modules = read('admin/js/content-modules.js')
content_polish = read('admin/js/content-modules-polish.js')
classes_html = read('admin/classes.html')
site_texts = read('admin/site-texts.html')
data_health = read('admin/data-health.html')
polish_css = read('admin/css/admin-polish.css')
releases_html = read('admin/releases.html')
releases_js = read('admin/js/releases.js')

for href in re.findall(r"href:'(\./[^']+\.html)'", shell_core):
    target = ROOT / 'admin' / href.removeprefix('./')
    if not target.exists(): errors.append(f'menu Admin aponta para arquivo inexistente: {href}')
require(shell_core, "id:'releases',label:'Versões públicas'", 'admin-shell core')
require(shell_core, "href:'./releases.html'", 'admin-shell core')
require(shell_core, "id:'announcements',label:'Avisos e Manutenção'", 'admin-shell core')
require(shell_core, "href:'./site-content.html?page=global_announcement'", 'admin-shell core')
require(shell_core, 'admin-shell-search-input', 'admin-shell core')
require(shell_core, 'bindMenuSearch', 'admin-shell core')
forbid(shell_wrapper, 'injectReleaseNavigation', 'admin-shell wrapper')
forbid(shell_wrapper, 'injectBrainNavigation', 'admin-shell wrapper')
require(releases_html, 'data-admin-content', 'releases')
require(releases_js, ".from('site_pages')", 'releases.js')
require(releases_js, ".eq('page_key','versions')", 'releases.js')

require(hero_status, 'id="hero-status-total"', 'hero-stats')
require(hero_status, 'id="hero-status-refresh"', 'hero-stats')
require(hero_status, 'hero-status-overview.js?v=20260821-admin-polish-1', 'hero-stats')
require(hero_status, 'admin-polish.css?v=20260821-admin-polish-1', 'hero-stats')
forbid(hero_status, 'location.replace(', 'hero-stats')
require(hero_status_js, ".from('v_heroes_complete')", 'hero-status-overview')
require(hero_status_js, ".from('hero_skills')", 'hero-status-overview')
require(hero_status_js, "value == null ? '—'", 'hero-status-overview')

require(equipment_import, 'data-admin-content', 'equipment-import')
require(equipment_import, 'initAdminShell', 'equipment-import')
require(equipment_import, "activeId: 'equipment-ocr-import'", 'equipment-import')
require(equipment_import, 'admin-polish.css?v=20260821-admin-polish-1', 'equipment-import')
for required_id in ['screenshot','dropzone','extract','ocr-status','raw-text','review','review-area','send-editor']:
    require(equipment_import, f'id="{required_id}"', 'equipment-import')
forbid(equipment_import, 'class="sidebar"', 'equipment-import')
require(equipment_import_js, "sessionStorage.setItem(\n      'equipment-import-draft'", 'equipment-import.js')
require(equipment_import_js, "'./equipment-editor.html?import=1'", 'equipment-import.js')

require(equipment_ai, 'data-admin-content', 'equipment-ai-import')
require(equipment_ai, 'initAdminShell', 'equipment-ai-import')
require(equipment_ai, "activeId: 'equipment-ai-import'", 'equipment-ai-import')
require(equipment_ai, 'admin-polish.css?v=20260821-admin-polish-1', 'equipment-ai-import')
for required_id in ['equipment-ai-json','equipment-ai-slot','equipment-ai-validate','equipment-ai-save','equipment-ai-clear','equipment-ai-status','equipment-ai-review']:
    require(equipment_ai, f'id="{required_id}"', 'equipment-ai-import')
forbid(equipment_ai, 'class="sidebar"', 'equipment-ai-import')
require(equipment_ai, 'Importar por print (OCR)', 'equipment-ai-import')
require(equipment_ai_js, 'saveEquipmentBundle', 'equipment-ai-import.js')
require(equipment_ai_js, 'Revisar atualização', 'equipment-ai-import.js')

require(equipments, 'href="./equipment-import.html">Importar print</a>', 'equipments')
require(equipments, 'href="./equipment-ai-import.html">Importar JSON</a>', 'equipments')

# O wrapper precisa acompanhar o editor com escopo explícito da Fase 2A.
require(equipment_editor, 'equipment-editor.js?v=20260920-resolution-authority-1', 'equipment-editor')
require(equipment_editor, 'equipment-calculation-v2.js?v=20260920-resolution-authority-1', 'equipment-editor calculation v2')
require(equipment_editor_wrapper, 'equipment-attribute-assistant.js?v=20260920-resolution-authority-1', 'equipment-editor wrapper')
require(equipment_attribute_assistant, 'scanRows({ reanalyze: true });', 'equipment-attribute-assistant')
require(equipment_attribute_assistant, 'new MutationObserver(handleRarityMutations)', 'equipment-attribute-assistant')
forbid(equipment_attribute_assistant, "document.querySelectorAll('#rarities .attr-row').forEach(analyzeRow);", 'equipment-attribute-assistant')
forbid(equipment_attribute_assistant, 'new MutationObserver(scanRows)', 'equipment-attribute-assistant')

require(content_html, 'admin-polish.css?v=20260821-admin-polish-1', 'content-modules')
require(content_html, 'content-modules.js?v=20260822-editorial-freeze-hotfix-1', 'content-modules')
require(content_html, 'content-modules-polish.js?v=20260822-editorial-freeze-hotfix-1', 'content-modules')
require(content_modules, "const EDITORIAL_STATE_EVENT = 'echo:editorial-state-change';", 'content-modules.js')
require(content_modules, 'form.dispatchEvent(new CustomEvent(EDITORIAL_STATE_EVENT))', 'content-modules.js')
require(content_polish, "setAttribute('role','tablist')", 'content-modules-polish')
require(content_polish, "setAttribute('aria-selected',String(selected))", 'content-modules-polish')
require(content_polish, 'view.hidden = !selected', 'content-modules-polish')
require(content_polish, 'available:false', 'content-modules-polish')
require(content_polish, 'Nenhum zero foi assumido.', 'content-modules-polish')
require(content_polish, 'form.addEventListener(EDITORIAL_STATE_EVENT,update)', 'content-modules-polish')
require(content_polish, 'if (box.innerHTML !== markup) box.innerHTML = markup;', 'content-modules-polish')
forbid(content_polish, 'new MutationObserver(update).observe(form', 'content-modules-polish')

for label, html in [('classes', classes_html), ('site-texts', site_texts), ('data-health', data_health)]:
    require(html, 'admin-polish.css?v=20260821-admin-polish-1', label)
    require(html, 'admin-shell.js?v=20260906-home-featured-phase-e-1', label)

require(polish_css, '@media (pointer:coarse)', 'admin-polish.css')
require(polish_css, '.ocr-import-page', 'admin-polish.css')
require(polish_css, '.hero-status-page', 'admin-polish.css')
require(polish_css, '.content-hub-tab[aria-selected="true"]', 'admin-polish.css')

if errors:
    print('ADMIN POLISH GATE: FALHOU')
    for error in errors: print(f'- {error}')
    sys.exit(1)

print('ADMIN POLISH GATE: OK')
print('- destinos locais do menu existem')
print('- Versões públicas acessíveis pelo Admin sem expor histórico técnico')
print('- Status de Heróis é uma página operacional real')
print('- OCR e importador JSON preservam fluxos e usam o Admin Shell')
print('- abas editoriais têm estado acessível e falha de consulta explícita')
