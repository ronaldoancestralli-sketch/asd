from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
failures = []


def require(source, token, label):
    if token not in source:
        failures.append(f'{label}: ausente {token!r}')


def read(relative):
    path = ROOT / relative
    if not path.exists():
        failures.append(f'arquivo ausente: {relative}')
        return ''
    return path.read_text(encoding='utf-8')


banner = read('js/public-global-announcement.js')
guard = read('js/guard.js')
styles = read('css/public-global-announcement.css')
schema = read('js/site-content-schema.js')
admin = read('admin/js/site-content.js')
admin_page = read('admin/site-content.html')
awareness = read('admin/js/admin-announcement-awareness.js')
admin_styles = read('admin/css/admin-announcement.css')
admin_shell = read('admin/js/admin-shell.js')

for token in (
    "const PAGE_KEY = 'global_announcement'",
    ".from('site_pages')",
    ".eq('page_key', PAGE_KEY)",
    ".eq('published', true)",
    'content.enabled !== true',
    'isInsidePublicationWindow',
    'scheduleBoundaryRefresh',
    "new Set(['maintenance', 'attention', 'promotion', 'thanks'])",
    "insertAdjacentElement('beforebegin', banner)",
    "localStorage.setItem(key, '1')",
    "role', variant === 'maintenance' || variant === 'attention' ? 'alert' : 'status'",
    "public-global-announcement.css?v=20260822-maintenance-2",
    "content.access_mode !== 'maintenance_lock'",
    "maintenanceLock && (variant !== 'maintenance' || !validDate(content.ends_at))",
    'safeHref',
    'escapeHtml'
):
    require(banner, token, 'banner público')

for token in (
    'data-variant="attention"',
    'data-variant="promotion"',
    'data-variant="thanks"',
    '@media(max-width:980px)',
    '@media(max-width:720px)',
    '@media(max-width:480px)',
    '@media(prefers-reduced-motion:reduce)',
    'env(safe-area-inset-right)',
    '.echo-announcement-inner.has-cta'
):
    require(styles, token, 'CSS responsivo')

if 'position:fixed' in styles or 'position:sticky' in styles:
    failures.append('CSS: a faixa global deve ocupar o fluxo e não cobrir o cabeçalho')

for token in (
    "key: 'global_announcement'",
    "field('variant', 'Tipo de aviso', 'select'",
    "field('access_mode', 'Comportamento do site', 'select'",
    "{ value: 'banner_only', label: 'Somente banner — site continua online' }",
    "{ value: 'maintenance_lock', label: 'Manutenção completa — bloquear visitantes' }",
    "field('message', 'Mensagem principal', 'textarea'",
    "field('starts_at', 'Início programado (opcional)', 'datetime'",
    "field('ends_at', 'Encerramento programado', 'datetime'",
    "field('enabled', 'Exibir o aviso no site', 'toggle', 'Visibilidade', { default: false })",
    "field('dismissible', 'Permitir que o visitante feche o banner', 'toggle', 'Visibilidade', { default: true })"
):
    require(schema, token, 'schema do Admin')

for token in (
    "field.type === 'select'",
    "isDatetime ? 'datetime-local'",
    "control.dataset.contentKind !== 'datetime'",
    "state.page.key === 'global_announcement' && state.content.enabled === true",
    "Informe a mensagem principal antes de ativar o aviso.",
    "O encerramento precisa acontecer depois do início.",
    "Defina o encerramento da manutenção para garantir a reabertura automática do site.",
    "O bloqueio de visitantes só pode ser usado com o tipo Manutenção.",
    "title: scheduled ? 'Programar o bloqueio dos visitantes?' : 'Bloquear os visitantes agora?'",
    "Preencha o texto e o destino do botão"
):
    require(admin, token, 'editor do Admin')

for token in (
    'announcementTabs',
    "'announcement-type'",
    "'announcement-message'",
    "'announcement-schedule'",
    "'announcement-publish'",
    'evaluateAnnouncementState',
    'Manutenção completa selecionada',
    'Somente comunicação: o site continuará online',
    'Acesso dos visitantes',
    'Programar manutenção',
    'Ativar manutenção agora',
    'renderAnnouncementAccessModeField',
    'Salvar e ativar banner',
    'data-announcement-schedule',
    "window.dispatchEvent(new CustomEvent('echo:announcement-saved'))"
):
    require(admin, token, 'fluxo guiado do Admin')

for token in (
    "const PAGE_KEY = 'global_announcement'",
    "client.from('site_pages')",
    "client.rpc('site_status')",
    "state: 'scheduled'",
    "state: 'active'",
    "state: 'expired'",
    'Aviso de manutenção visível; o site permanece online.',
    'Site em manutenção programada',
    'manualMaintenanceMode',
    'scheduledMaintenanceMode',
    'Status do site não confirmado',
    "tone = 'unavailable'",
    'admin-site-operation-strip',
    'dashboard-announcement-card',
    "window.addEventListener('echo:announcement-saved'"
):
    require(awareness, token, 'indicador global do Admin')

for token in (
    '.admin-site-operation-strip',
    '[data-tone="critical"]',
    '[data-tone="unavailable"]',
    '.announcement-command-center',
    '.announcement-variant-grid',
    '.announcement-access-grid',
    '[data-access-mode="maintenance_lock"]',
    '.announcement-master-switch',
    '@media(max-width:900px)',
    '@media(max-width:560px)',
    '@media(prefers-reduced-motion:reduce)'
):
    require(admin_styles, token, 'CSS da Central de Avisos')

require(admin_shell, "./admin-announcement-awareness.js?v=20260822-maintenance-2", 'Admin Shell')
require(admin_page, "./js/site-content.js?v=20260822-maintenance-2", 'página da Central de Avisos')

if ".insert(" in awareness or ".upsert(" in awareness or ".update(" in awareness or ".delete(" in awareness:
    failures.append('indicador global do Admin deve ser estritamente somente leitura')

public_pages = (
    'index.html', 'herois.html', 'builds.html', 'criar-build.html',
    'equipamentos.html', 'comparar-build.html', 'estatisticas.html',
    'composicoes.html', 'diversao.html', 'classes.html', 'tier-list.html',
    'comunidade.html', 'noticias.html', 'versoes.html', 'sobre.html',
    'suporte.html', 'guias.html'
)
reference = './js/public-global-announcement.js?v=20260822-maintenance-2'
for page in public_pages:
    source = read(page)
    if source.count(reference) != 1:
        failures.append(f'{page}: precisa carregar exatamente uma vez {reference}')

guard_pages = public_pages + ('hero-editor.html',)
guard_reference = './js/guard.js?v=20260822-maintenance-2'
for page in guard_pages:
    source = read(page)
    if source.count(guard_reference) != 1:
        failures.append(f'{page}: precisa carregar exatamente uma vez {guard_reference}')
        continue
    head_end = source.find('<head>') + len('<head>')
    guard_at = source.find(f'<script src="{guard_reference}"></script>')
    if head_end < len('<head>') or guard_at < head_end or source[head_end:guard_at].strip():
        failures.append(f'{page}: o porteiro deve ser o primeiro recurso dentro de <head>')

for token in (
    "var ANNOUNCEMENT_PAGE_KEY = 'global_announcement'",
    "var MAINTENANCE_ACCESS_MODE = 'maintenance_lock'",
    'evaluateScheduledMaintenance',
    "content.access_mode === MAINTENANCE_ACCESS_MODE",
    'scheduleBoundaryReload',
    "request('/rest/v1/rpc/echo_is_admin'",
    'window.__ECHO_BLOCKED = true',
    'Retorno automático previsto para',
    'Acesso administrativo',
    'estado de manutenção indisponível; site mantido online'
):
    require(guard, token, 'porteiro global')

if '/profiles?select=role' in guard:
    failures.append('porteiro global: autorização não pode depender da coluna role; use echo_is_admin()')

require(read('tests/maintenance-guard.test.mjs'), "test('administrador autenticado preserva o site", 'testes do porteiro')

seed_sources = [
    path for path in ROOT.rglob('*')
    if path.is_file() and path.suffix.lower() in {'.sql', '.js', '.py'}
    and '.git' not in path.parts
]
for path in seed_sources:
    if path.name == 'check-global-announcement-center.py':
        continue
    text = path.read_text(encoding='utf-8', errors='ignore').lower()
    if 'global_announcement' in text and ('insert into public.site_pages' in text or 'insert into site_pages' in text):
        failures.append(f'{path.relative_to(ROOT)}: não deve inserir aviso fictício no banco')

if failures:
    print('GLOBAL ANNOUNCEMENT CENTER: FALHOU')
    for failure in failures:
        print(f' - {failure}')
    raise SystemExit(1)

print(f'GLOBAL ANNOUNCEMENT CENTER: OK ({len(public_pages)} páginas públicas, 4 identidades, padrão inerte)')
