import { supabase } from './supabase.js?v=20260823-security-supabase-pin-1';

const root = document.querySelector('[data-pulse-public-root]');
if (!root) throw new Error('Echo Pulse public root ausente.');

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#039;'
}[ch]));
const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const fmt = value => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Data não informada';
  return date.toLocaleDateString('pt-BR', { day:'2-digit', month:'short', year:'numeric' });
};
const fmtTime = value => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('pt-BR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
};
const statusLabel = value => ({
  inbox:'Inbox', review:'Em revisão', approved:'Aprovado', published:'Preparado'
})[value] || 'Em preparação';
const categoryLabel = value => ({
  update:'Atualização', patch:'Patch', event:'Evento', community:'Comunidade',
  creator:'Criadores', gaming:'Jogos', other:'Outro'
})[value] || 'Atualização';
const platformLabel = value => ({
  web:'Web', youtube:'YouTube', reddit:'Reddit', discord:'Discord', x:'X', instagram:'Instagram'
})[String(value || '').toLowerCase()] || String(value || 'Fonte');

function translationChip(item) {
  return item?.metadata?.editorial_language === 'pt-BR'
    ? '<span class="pulse-preview-chip is-ok">PT-BR</span>'
    : '<span class="pulse-preview-chip is-warn">Tradução pendente</span>';
}

function renderCard(item, { featured = false, compact = false } = {}) {
  const image = item.image_url
    ? `<div class="pulse-preview-card-media"><img src="${esc(item.image_url)}" alt="" loading="lazy"></div>`
    : '<div class="pulse-preview-card-media pulse-preview-card-media-empty"><span>ECHO</span></div>';

  return `<article class="pulse-preview-card ${featured ? 'is-featured' : ''} ${compact ? 'is-compact' : ''}">
    ${image}
    <div class="pulse-preview-card-body">
      <div class="pulse-preview-meta">
        <span class="pulse-preview-chip">${esc(categoryLabel(item.category))}</span>
        <span class="pulse-preview-chip">${esc(statusLabel(item.status))}</span>
        ${item.trust_level === 'official' ? '<span class="pulse-preview-chip is-official">Oficial</span>' : ''}
        ${translationChip(item)}
      </div>
      <h2>${esc(item.title || 'Sem título')}</h2>
      <p>${esc(item.summary || item.source_excerpt || 'Conteúdo ainda sem resumo editorial.')}</p>
      <div class="pulse-preview-source">
        <span>${esc(item.source_name || 'Fonte registrada')} · ${esc(fmt(item.source_published_at || item.collected_at))}</span>
        ${item.canonical_url ? `<a href="${esc(item.canonical_url)}" target="_blank" rel="noopener noreferrer">Conferir fonte ↗</a>` : ''}
      </div>
    </div>
  </article>`;
}

function emptyState({ eyebrow, title, text, detail = '', icon = '◌', action = '' }) {
  return `<div class="pulse-signal-empty">
    <div class="pulse-signal-empty-icon">${esc(icon)}</div>
    <div class="pulse-signal-empty-copy">
      <span>${esc(eyebrow)}</span>
      <strong>${esc(title)}</strong>
      <p>${esc(text)}</p>
      ${detail ? `<small>${esc(detail)}</small>` : ''}
    </div>
    ${action}
  </div>`;
}

function sectionHeader(id, eyebrow, title, description, badge = '') {
  return `<header class="pulse-zone-head" id="${id}">
    <div><span>${esc(eyebrow)}</span><h2>${esc(title)}</h2><p>${esc(description)}</p></div>
    ${badge ? `<div class="pulse-zone-badge">${esc(badge)}</div>` : ''}
  </header>`;
}

function renderCommunity(feed) {
  const posts = Array.isArray(feed.community) ? feed.community : [];
  if (!posts.length) {
    return emptyState({
      eyebrow:'Comunidade real',
      title:'Ainda não há conversas para destacar',
      text:'O radar não vai simular atividade. Quando jogadores criarem discussões, perguntas ou dicas reais, os sinais mais relevantes poderão aparecer aqui.',
      detail:'0 posts e 0 respostas disponíveis agora.',
      icon:'✦',
      action:'<a class="pulse-empty-action" href="./comunidade.html">Abrir Comunidade</a>'
    });
  }
  return `<div class="pulse-community-list">${posts.map(post => `
    <article class="pulse-community-card">
      <div class="pulse-community-avatar">${esc((post.author_name || 'J').slice(0,1).toUpperCase())}</div>
      <div><span>${esc(post.author_name || 'Jogador')} · ${esc(fmt(post.created_at))}</span><h3>${esc(post.title || 'Discussão')}</h3><p>${esc(post.body || '')}</p><small>${num(post.reaction_count)} reação(ões) · ${num(post.reply_count)} resposta(s)</small></div>
    </article>`).join('')}</div>`;
}

function renderMeta(feed) {
  const activity = feed.build_activity || {};
  const publicBuilds = num(activity.public_builds);
  const engagedBuilds = num(activity.engaged_builds);
  const totalSignals = num(activity.views) + num(activity.likes) + num(activity.comments) + num(activity.favorites) + num(activity.ratings);

  if (!engagedBuilds || !totalSignals) {
    return `<div class="pulse-meta-panel">
      <div class="pulse-meta-score"><span>Leitura atual</span><strong>SEM SINAL</strong><small>volume insuficiente</small></div>
      <div class="pulse-meta-copy"><h3>Não existe atividade suficiente para declarar uma tendência.</h3><p>O EchoArena já possui ${publicBuilds} build(s) pública(s) indexada(s), mas elas ainda não acumularam interações mensuráveis suficientes. O Pulse não vai transformar cadastro em “meta” artificial.</p><div class="pulse-meta-facts"><span>${publicBuilds}<small>builds públicas</small></span><span>${engagedBuilds}<small>com interação</small></span><span>${totalSignals}<small>sinais medidos</small></span></div></div>
    </div>`;
  }

  return `<div class="pulse-meta-panel has-signal">
    <div class="pulse-meta-score"><span>Leitura atual</span><strong>${engagedBuilds}</strong><small>builds com sinal</small></div>
    <div class="pulse-meta-copy"><h3>A atividade interna já começa a formar sinais.</h3><p>Esta leitura usa somente interações reais do EchoArena. Ela não representa estatísticas globais do Bullet Echo.</p><div class="pulse-meta-facts"><span>${num(activity.views)}<small>visualizações</small></span><span>${num(activity.likes)}<small>curtidas</small></span><span>${num(activity.comments)}<small>comentários</small></span></div></div>
  </div>`;
}

function renderSourceCoverage(feed) {
  const sources = Array.isArray(feed.sources) ? feed.sources : [];
  if (!sources.length) return '';
  return `<div class="pulse-owner-coverage">
    <div class="pulse-owner-coverage-head"><div><span>COBERTURA DO RADAR · SÓ VOCÊ VÊ ISTO</span><strong>Fontes configuradas</strong></div><small>${sources.filter(s => s.auto_collect).length}/${sources.length} com coleta automática</small></div>
    <div class="pulse-owner-source-grid">${sources.map(source => {
      const healthy = source.auto_collect && source.last_success_at && !source.last_error;
      const state = healthy ? 'Automática e saudável' : source.auto_collect ? 'Automática com atenção' : 'Cadastrada · automação pendente';
      return `<article class="pulse-owner-source ${healthy ? 'is-live' : ''}"><div><span>${esc(platformLabel(source.platform))}</span><strong>${esc(source.name)}</strong></div><small>${esc(state)}</small>${source.last_success_at ? `<em>Último sucesso: ${esc(fmtTime(source.last_success_at))}</em>` : '<em>Ainda sem execução automática</em>'}</article>`;
    }).join('')}</div>
  </div>`;
}

function renderPrivatePreview(feed) {
  const items = Array.isArray(feed?.items) ? feed.items : [];
  const overview = feed?.overview || {};
  const featured = items.find(item => item.is_featured) || items[0] || null;
  const remaining = featured ? items.filter(item => item.id !== featured.id) : items;
  const updates = remaining.filter(item => ['update','event','other'].includes(item.category));
  const patches = items.filter(item => item.category === 'patch');
  const creatorItems = items.filter(item => item.category === 'creator');
  const gamingItems = items.filter(item => item.category === 'gaming');
  const eventItems = items.filter(item => item.category === 'event');
  const youtubeSource = (feed.sources || []).find(source => String(source.platform).toLowerCase() === 'youtube');
  const lastCollection = overview.last_collected_at ? fmtTime(overview.last_collected_at) : 'ainda sem coleta';

  root.innerHTML = `<div class="pulse-preview-app">
    <section class="pulse-private-banner">
      <div><span>PRÉVIA PRIVADA · ACESSO EXCLUSIVO</span><strong>Você está vendo a página real em desenvolvimento.</strong><p>Visitantes, contas comuns e outros administradores continuam recebendo apenas “Em breve”.</p></div>
      <a href="./admin/echo-pulse.html">Abrir curadoria</a>
    </section>

    <section class="pulse-preview-hero">
      <div class="pulse-preview-hero-copy"><span class="pulse-preview-kicker">Radar editorial · Bullet Echo</span><h1>ECHO <em>PULSE</em></h1><p>O lugar para entender o que mudou, o que importa, o que a comunidade está discutindo e quais sinais estão surgindo ao redor de Bullet Echo.</p></div>
      <div class="pulse-preview-state"><span>Última coleta</span><strong>${esc(lastCollection)}</strong><small>${num(overview.sources_auto)}/${num(overview.sources_enabled)} fontes automáticas</small></div>
    </section>

    <nav class="pulse-local-nav" aria-label="Seções do Echo Pulse">
      <a href="#agora">Agora</a><a href="#patches">Patches</a><a href="#comunidade-pulse">Comunidade</a><a href="#meta-pulse">Meta</a><a href="#criadores">Criadores</a><a href="#jogos">Jogos</a><a href="#agenda">Agenda</a>
    </nav>

    <section class="pulse-snapshot">
      <article><span>Oficial</span><strong>${num(overview.official_items)}</strong><small>item(ns) confirmado(s)</small></article>
      <article><span>Radar</span><strong>${num(overview.sources_enabled)}</strong><small>fontes cadastradas</small></article>
      <article><span>Comunidade</span><strong>${num(overview.community_posts) + num(overview.community_comments)}</strong><small>interações reais</small></article>
      <article><span>Sinais de builds</span><strong>${num(feed?.build_activity?.engaged_builds)}</strong><small>com atividade medida</small></article>
    </section>

    ${featured ? `<section class="pulse-preview-featured"><div class="pulse-preview-section-head"><span>Destaque do Pulse</span><strong>Principal sinal editorial desta prévia</strong></div>${renderCard(featured,{featured:true})}</section>` : ''}

    <section class="pulse-zone pulse-zone-now">
      ${sectionHeader('agora','AGORA NO BULLET','O que merece sua atenção','Atualizações oficiais, eventos e movimentos relevantes do jogo.',`${updates.length} sinal(is)`)}
      <div class="pulse-zone-grid">${updates.length ? updates.map(item => renderCard(item,{compact:true})).join('') : emptyState({eyebrow:'Radar atualizado',title:'O destaque acima é o único sinal coletado até agora',text:'Assim que novas fontes trouxerem atualizações relevantes, elas entram aqui sem precisar remodelar a página.',detail:`${num(overview.pulse_items)} item(ns) total na Inbox privada.`,icon:'↗'})}</div>
    </section>

    <section class="pulse-zone">
      ${sectionHeader('patches','PATCH RADAR','Balanceamento sem ruído','Mudanças de balanceamento, buffs, nerfs e alterações que realmente podem afetar decisões de jogo.',`${patches.length} detectado(s)`)}
      <div class="pulse-zone-grid">${patches.length ? patches.map(item => renderCard(item,{compact:true})).join('') : emptyState({eyebrow:'Nenhum patch confirmado',title:'Sem alteração de balanceamento detectada',text:'Quando uma fonte oficial trouxer patch, buff ou nerf, essa área poderá relacionar a mudança aos heróis e sistemas cadastrados no EchoArena.',detail:'Nenhum zero é interpretado como “nada mudou”; significa apenas que não há fonte coletada para afirmar isso.',icon:'◎'})}</div>
    </section>

    <section class="pulse-zone pulse-zone-community">
      ${sectionHeader('comunidade-pulse','RADAR DA COMUNIDADE','O que os jogadores estão trazendo para a mesa','Discussões reais do EchoArena ganham contexto aqui — sem seguidores falsos, números inflados ou assuntos inventados.',`${num(overview.community_posts)} conversa(s)`)}
      ${renderCommunity(feed)}
    </section>

    <section class="pulse-zone pulse-zone-meta">
      ${sectionHeader('meta-pulse','META EM MOVIMENTO','Sinais, não certezas','O Pulse só chama algo de tendência quando existe atividade mensurável. Até lá, mostra o que sabe e o que ainda não sabe.','dados próprios')}
      ${renderMeta(feed)}
    </section>

    <section class="pulse-zone">
      ${sectionHeader('criadores','CRIADORES & VÍDEOS','Conteúdo que vale acompanhar','Vídeos oficiais e, depois, criadores selecionados da comunidade podem entrar neste radar com origem claramente identificada.',`${creatorItems.length} item(ns)`)}
      <div class="pulse-zone-grid">${creatorItems.length ? creatorItems.map(item => renderCard(item,{compact:true})).join('') : emptyState({eyebrow:'YouTube oficial cadastrado',title:'A área está pronta; o conector ainda não está automático',text:youtubeSource ? 'A fonte oficial do YouTube já existe no sistema, mas continua configurada como coleta manual. Não vou preencher esse espaço com vídeos fictícios.' : 'Nenhuma fonte de vídeo está habilitada ainda.',detail:youtubeSource ? `Fonte: ${youtubeSource.name}.` : '',icon:'▶'})}</div>
    </section>

    <section class="pulse-zone">
      ${sectionHeader('jogos','ALÉM DO BULLET','Gaming com filtro editorial','Novidades de shooters, PvP e mobile só entram quando tiverem relação real com o público do EchoArena.',`${gamingItems.length} item(ns)`)}
      <div class="pulse-zone-grid">${gamingItems.length ? gamingItems.map(item => renderCard(item,{compact:true})).join('') : emptyState({eyebrow:'Curadoria restrita',title:'Nenhuma notícia externa foi considerada relevante ainda',text:'Essa área não será um portal genérico de jogos. Ela só ganha conteúdo quando houver relação clara com Bullet Echo ou com o perfil de quem joga o game.',icon:'◇'})}</div>
    </section>

    <section class="pulse-zone pulse-zone-agenda">
      ${sectionHeader('agenda','AGENDA ECHO','O que vem a seguir','Temporadas, eventos, torneios e datas só aparecem aqui quando houver uma data confirmada por fonte confiável.',`${eventItems.length} sinal(is) de evento`)}
      ${emptyState({eyebrow:'Agenda estruturada',title:'Ainda não há evento com data estruturada suficiente',text:'Uma notícia mencionar um evento não basta para inventar uma data de agenda. Esse módulo vai exigir início/fim confirmados antes de criar um calendário.',detail:eventItems.length ? `${eventItems.length} matéria(s) de evento existem, mas sem data de agenda confirmada.` : 'Nenhum evento coletado nesta prévia.',icon:'□'})}
    </section>

    ${renderSourceCoverage(feed)}

    <section class="pulse-preview-footer"><div><span>ECHO PULSE · PRÉVIA PRIVADA</span><strong>A página já tem a arquitetura completa. Agora cada conector novo passa a alimentar uma área existente.</strong></div><a href="./admin/echo-pulse.html">Voltar para a Inbox</a></section>
  </div>`;

  document.documentElement.dataset.echoPulsePrivatePreview = 'true';
  document.title = 'Echo Pulse · Prévia privada — Echo Arena';
}

async function tryPrivatePreview() {
  try {
    const { data:{ session }, error:sessionError } = await supabase.auth.getSession();
    if (sessionError || !session?.user) return;

    const { data:allowed, error:allowedError } = await supabase.rpc('echo_can_preview_pulse');
    if (allowedError || allowed !== true) return;

    const { data:feed, error:feedError } = await supabase.rpc('echo_pulse_private_preview_feed');
    if (feedError || feed?.allowed !== true) {
      console.error('[Echo Pulse preview] feed privado indisponível:', feedError?.message || 'acesso não confirmado');
      return;
    }

    renderPrivatePreview(feed);
  } catch (error) {
    console.error('[Echo Pulse preview] falha segura; mantendo página Em breve:', error);
  }
}

await tryPrivatePreview();
