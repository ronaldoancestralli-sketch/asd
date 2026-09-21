#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def read(path):
    return (ROOT / path).read_text(encoding='utf-8')

def require(text, needle, label):
    if needle not in text:
        raise SystemExit(f'[Echo Pulse private] ausente: {label}')

def forbid(text, needle, label):
    if needle in text:
        raise SystemExit(f'[Echo Pulse private] proibido: {label}')

public_html = read('noticias.html')
public_preview_js = read('js/echo-pulse-private-preview.js')
public_preview_css = read('css/echo-pulse-private-preview.css')
admin_html = read('admin/echo-pulse.html')
admin_js = read('admin/js/echo-pulse.js')
dashboard_html = read('admin/index.html')
edge = read('supabase/functions/echo-pulse-ingest/index.ts')
migration = read('supabase/migrations/20260821125500_restrict_echo_pulse_to_admin_only.sql')
owner_preview_migration = read('supabase/migrations/20260821143000_echo_pulse_owner_preview.sql')
expanded_preview_migration = read('supabase/migrations/20260821144500_expand_echo_pulse_owner_preview.sql')
community = read('comunidade.html')

require(public_html, 'Echo Pulse', 'identidade pública do módulo')
require(public_html, 'Em breve', 'estado público Em breve')
require(public_html, 'restrito ao painel administrativo', 'mensagem de acesso restrito')
require(public_html, 'data-pulse-public-root', 'raiz segura da prévia privada')
require(public_html, 'echo-pulse-private-preview.css?v=20260821-owner-preview-2', 'cache da prévia privada CSS')
require(public_html, 'echo-pulse-private-preview.js?v=20260821-owner-preview-2', 'cache da prévia privada JS')
forbid(public_html, 'pulse_items', 'HTML público não pode consultar pulse_items diretamente')

require(public_preview_js, "supabase.rpc('echo_can_preview_pulse')", 'checagem server-side da permissão exclusiva')
require(public_preview_js, "supabase.rpc('echo_pulse_private_preview_feed')", 'feed privado via RPC protegida')
require(public_preview_js, 'PRÉVIA PRIVADA · ACESSO EXCLUSIVO', 'sinalização inequívoca da prévia')
require(public_preview_js, 'outros administradores continuam recebendo apenas', 'aviso de escopo exclusivo')
forbid(public_preview_js, ".from('pulse_items')", 'prévia pública não pode burlar a RPC por SELECT direto')

for section in ['AGORA NO BULLET','PATCH RADAR','RADAR DA COMUNIDADE','META EM MOVIMENTO','CRIADORES & VÍDEOS','ALÉM DO BULLET','AGENDA ECHO']:
    require(public_preview_js, section, f'seção completa: {section}')
require(public_preview_js, 'O radar não vai simular atividade', 'comunidade sem atividade fictícia')
require(public_preview_js, 'não vai transformar cadastro em “meta” artificial', 'meta sem tendência inventada')
require(public_preview_js, 'Não vou preencher esse espaço com vídeos fictícios', 'criadores sem conteúdo inventado')
require(public_preview_js, 'COBERTURA DO RADAR · SÓ VOCÊ VÊ ISTO', 'painel privado de cobertura das fontes')

for selector in ['.pulse-local-nav','.pulse-snapshot','.pulse-zone-head','.pulse-meta-panel','.pulse-owner-coverage']:
    require(public_preview_css, selector, f'estilo completo {selector}')
require(public_preview_css, '@media(pointer:coarse)', 'alvos touch para iPad')

require(dashboard_html, 'href="./echo-pulse.html"', 'acesso direto ao Echo Pulse no Dashboard')
require(dashboard_html, 'Echo Pulse · interno', 'card do Echo Pulse no Dashboard')

require(admin_html, 'SOMENTE ADMIN', 'sinalização de acesso interno no Admin')
require(admin_html, 'Abrir prévia privada ↗', 'atalho Admin para a página real em desenvolvimento')
require(admin_html, './js/echo-pulse.js?v=20260822-admin-nav-1', 'cache-busting do módulo Admin')
require(admin_js, 'initAdminShell', 'Admin Shell obrigatório')
require(admin_js, 'admin_set_pulse_item_status', 'RPC administrativa de estado')
require(admin_js, 'O acesso público continua bloqueado por RLS', 'mensagem correta do modo privado')
require(admin_js, "editorial_language:'pt-BR'", 'curadoria editorial PT-BR')
require(admin_js, 'translation_locked:true', 'trava da tradução editorial')
require(admin_js, 'Original da fonte', 'preservação visual do texto original')
require(admin_js, 'Tradução pendente', 'estado explícito para conteúdo ainda não localizado')

require(edge, "npm:@supabase/supabase-js@2.112.2", 'dependência Supabase pinada')
require(edge, "collector_version:4", 'versão do coletor com separação de idioma')
require(edge, "source_language:'en'", 'idioma original registrado')
require(edge, "translation_status:'pending'", 'tradução pendente em item novo')
require(edge, "translation_locked", 'proteção da curadoria traduzida')
require(edge, "existing.status==='inbox'&&!translationLocked", 'Cron só substitui texto cru não traduzido da Inbox')
forbid(edge, "existing.status==='inbox'||existing.status==='review'", 'Cron não pode sobrescrever item em revisão')

require(migration, 'drop policy if exists pulse_items_public_read', 'remoção da leitura pública de pulse_items')
require(migration, 'drop policy if exists pulse_item_heroes_public_read', 'remoção da leitura pública dos vínculos')
require(migration, 'revoke select on public.pulse_items from anon', 'revogação SELECT anon em pulse_items')
require(migration, 'pulse_item_id is null', 'comunidade pública sem contexto Pulse enquanto privado')

require(owner_preview_migration, 'pulse_preview_access', 'whitelist explícita da prévia')
require(owner_preview_migration, 'v_admin_count <> 1', 'concessão inicial exige um único administrador ativo')
require(owner_preview_migration, 'Administradores criados depois NÃO herdam acesso', 'não-herança automática documentada')
require(owner_preview_migration, 'revoke all on table public.pulse_preview_access from public, anon, authenticated', 'whitelist sem leitura cliente')
require(owner_preview_migration, 'echo_can_preview_pulse()', 'RPC de autorização dedicada')
require(owner_preview_migration, 'ppa.user_id = auth.uid()', 'autorização vinculada ao UID da sessão')
require(owner_preview_migration, "raise exception 'echo_pulse_preview_forbidden'", 'negação server-side do feed privado')
require(owner_preview_migration, 'revoke all on function public.echo_pulse_private_preview_feed() from public, anon', 'feed privado indisponível ao anônimo')

require(expanded_preview_migration, "'sources'", 'feed privado inclui cobertura de fontes')
require(expanded_preview_migration, "'community'", 'feed privado inclui atividade comunitária real')
require(expanded_preview_migration, "'overview'", 'feed privado inclui visão geral')
require(expanded_preview_migration, "'build_activity'", 'feed privado inclui sinais mensuráveis de builds')
require(expanded_preview_migration, "coalesce(cp.status, 'active') not in ('hidden', 'deleted')", 'atividade comunitária moderada')
require(expanded_preview_migration, 'engaged_builds', 'meta exige interação medida')

require(community, 'community.js?v=20260905-institutional-scout-exclusion-v2-1', 'comunidade real versionada')
print('Echo Pulse private mode + owner-only full preview + PT-BR: OK')
