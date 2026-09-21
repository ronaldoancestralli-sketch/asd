import { supabase } from '../../js/supabase.js?v=20260823-security-supabase-pin-1';

const TAB_TABLES = {
  guides: { table:'guides', published:'published', label:'Guias' },
  news: { table:'news', published:'published', label:'Notícias' },
  tier: { table:'tier_lists', published:'published', label:'Tier List' },
  compositions: { table:'team_compositions', published:'is_public', label:'Composições' }
};
const EDITORIAL_STATE_EVENT = 'echo:editorial-state-change';

function esc(value='') {
  return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
}

function tabButton(key) {
  return document.querySelector(`[data-hub-tab="${CSS.escape(key)}"]`);
}

function tabView(key) {
  return document.querySelector(`[data-hub-view="${CSS.escape(key)}"]`);
}

function syncTabA11y(activeKey) {
  document.querySelectorAll('[data-hub-tab]').forEach(button => {
    const selected = button.dataset.hubTab === activeKey;
    button.setAttribute('role','tab');
    button.setAttribute('aria-selected',String(selected));
    button.setAttribute('tabindex',selected?'0':'-1');
    const panelId = `content-panel-${button.dataset.hubTab}`;
    button.setAttribute('aria-controls',panelId);
    if (selected) button.scrollIntoView({block:'nearest',inline:'nearest',behavior:'smooth'});
  });
  document.querySelectorAll('[data-hub-view]').forEach(view => {
    const selected = view.dataset.hubView === activeKey;
    view.id = `content-panel-${view.dataset.hubView}`;
    view.setAttribute('role','tabpanel');
    view.setAttribute('aria-labelledby',`content-tab-${view.dataset.hubView}`);
    view.hidden = !selected;
  });
}

function activateHashTab() {
  const key = location.hash.replace(/^#/,'') || 'guides';
  if (!TAB_TABLES[key]) return;
  const button = tabButton(key);
  if (!button) return;
  button.click();
  syncTabA11y(key);
}

function bindHashTabs() {
  const nav = document.querySelector('.content-hub-tabs');
  nav?.setAttribute('role','tablist');
  nav?.setAttribute('aria-label','Módulos de conteúdo');

  const buttons = [...document.querySelectorAll('[data-hub-tab]')];
  buttons.forEach((button,index) => {
    const key = button.dataset.hubTab;
    button.id = `content-tab-${key}`;
    button.addEventListener('click', () => {
      if (key && location.hash !== `#${key}`) history.replaceState(null,'',`#${key}`);
      syncTabA11y(key);
    });
    button.addEventListener('keydown', event => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      const current = buttons.indexOf(button);
      let next = current;
      if (event.key === 'ArrowLeft') next = (current - 1 + buttons.length) % buttons.length;
      if (event.key === 'ArrowRight') next = (current + 1) % buttons.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = buttons.length - 1;
      buttons[next]?.focus();
      buttons[next]?.click();
    });
    if (index > 0) button.setAttribute('tabindex','-1');
  });

  window.addEventListener('hashchange', activateHashTab);
  activateHashTab();
}

async function countTable(config) {
  const totalResult = await supabase.from(config.table).select('id',{count:'exact',head:true});
  if (totalResult.error) throw totalResult.error;
  const visibleResult = await supabase.from(config.table).select('id',{count:'exact',head:true}).eq(config.published,true);
  if (visibleResult.error) throw visibleResult.error;
  return { total:Number(totalResult.count||0), visible:Number(visibleResult.count||0) };
}

async function renderOverview() {
  let target = document.getElementById('content-hub-overview');
  if (!target) {
    target = document.createElement('section');
    target.id = 'content-hub-overview';
    target.className = 'content-hub-overview';
    target.setAttribute('aria-label','Resumo dos módulos públicos');
    document.getElementById('content-hub-message')?.insertAdjacentElement('afterend', target);
  }

  const entries = await Promise.all(Object.entries(TAB_TABLES).map(async ([key,config]) => {
    const counts = await countTable(config);
    return { key,config,...counts };
  }));

  target.innerHTML = entries.map(({key,config,total,visible}) => `
    <article class="content-overview-card ${total>0&&visible===0?'attention':''}" data-overview="${esc(key)}">
      <small>${esc(config.label)}</small><strong>${visible}/${total}</strong>
      <span>${total===0?'Estrutura pronta, sem registros.':visible===0?'Há conteúdo, mas nada está público.':'publicado(s) / cadastrado(s)'}</span>
    </article>`).join('');

  entries.forEach(({key,total,visible}) => {
    const tab = tabButton(key);
    if (!tab) return;
    let badge = tab.querySelector('.content-tab-count');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'content-tab-count';
      badge.setAttribute('aria-hidden','true');
      tab.appendChild(badge);
    }
    badge.textContent = `${visible}/${total}`;
    badge.classList.toggle('has-items', visible > 0);
  });
}

function ensureReadinessBox(form) {
  let box = form.querySelector('.content-readiness');
  if (box) return box;
  box = document.createElement('div');
  box.className = 'content-readiness';
  box.setAttribute('role','status');
  box.setAttribute('aria-live','polite');
  const status = form.querySelector('[data-editor-status],#tier-status');
  if (status) status.insertAdjacentElement('beforebegin', box);
  else form.appendChild(box);
  return box;
}

function fieldValue(form,name) {
  return String(form.elements.namedItem(name)?.value || '').trim();
}

function assessEditorial(form) {
  const publishing = Boolean(form.elements.published?.checked);
  const title = fieldValue(form,'title');
  const slug = fieldValue(form,'slug');
  const summary = fieldValue(form,'summary');
  const content = fieldValue(form,'content');
  const metaTitle = fieldValue(form,'meta_title');
  const metaDescription = fieldValue(form,'meta_description');
  const hard = [];
  const soft = [];
  if (!title) hard.push('título');
  if (!slug) hard.push('slug');
  if (publishing && !summary) hard.push('resumo');
  if (publishing && !content) hard.push('conteúdo');
  if (publishing && !metaTitle) soft.push('título SEO');
  if (publishing && !metaDescription) soft.push('descrição SEO');
  return { publishing,hard,soft };
}

function applyReadiness(box,tone,markup) {
  const className = `content-readiness ${tone}`;
  if (box.className !== className) box.className = className;
  if (box.innerHTML !== markup) box.innerHTML = markup;
}

function renderEditorialReadiness(form) {
  const box = ensureReadinessBox(form);
  const state = assessEditorial(form);
  form.querySelectorAll('[required]').forEach(field => {
    const invalid = String(!String(field.value||'').trim());
    if (field.getAttribute('aria-invalid') !== invalid) field.setAttribute('aria-invalid',invalid);
  });

  const tone = state.hard.length?'error':state.soft.length?'warn':'ok';
  let markup;
  if (state.hard.length) {
    markup = `<strong>${state.publishing?'Publicação bloqueada':'Cadastro incompleto'}</strong><span>Preencha ${esc(state.hard.join(', '))}${state.publishing?' antes de publicar. Você ainda pode salvar como rascunho.':' antes de salvar.'}</span>`;
  } else if (state.publishing && state.soft.length) {
    markup = `<strong>Pronto para publicar, com melhoria recomendada</strong><span>Os dados obrigatórios estão completos. Para melhorar a descoberta, revise: ${esc(state.soft.join(', '))}.</span><div class="content-readiness-list">${state.soft.map(item=>`<span class="content-readiness-chip">${esc(item)}</span>`).join('')}</div>`;
  } else if (state.publishing) {
    markup = '<strong>Pronto para publicação</strong><span>Campos obrigatórios completos. O banco aceitará a publicação e o site poderá exibir o conteúdo.</span>';
  } else {
    markup = '<strong>Rascunho</strong><span>O registro pode ser salvo incompleto sem aparecer no site público.</span>';
  }
  applyReadiness(box,tone,markup);
}

async function tierEntryCount(form) {
  const id = fieldValue(form,'id');
  if (!id) return { count:0, available:true };
  const { count,error } = await supabase.from('tier_list_entries').select('id',{count:'exact',head:true}).eq('tier_list_id',id);
  if (error) return { count:null, available:false, error };
  return { count:Number(count||0), available:true };
}

let tierReadinessTicket = 0;
async function renderTierReadiness(form) {
  const ticket = ++tierReadinessTicket;
  const box = ensureReadinessBox(form);
  const title = fieldValue(form,'title');
  const slug = fieldValue(form,'slug');
  const publishing = Boolean(form.elements.published?.checked);
  const result = await tierEntryCount(form);
  if (ticket !== tierReadinessTicket) return;

  if (!result.available) {
    applyReadiness(box,'error',`<strong>Validação indisponível</strong><span>Não foi possível confirmar as entradas da Tier List no Supabase${result.error?.message?`: ${esc(result.error.message)}`:'.'} Nenhum zero foi assumido.</span>`);
    return;
  }

  const count = result.count;
  const hard = [!title?'título':'',!slug?'slug':''].filter(Boolean);
  const blocked = publishing && count === 0;
  const tone = hard.length||blocked?'error':'ok';
  let markup;
  if (hard.length) markup = `<strong>Cadastro incompleto</strong><span>Preencha ${esc(hard.join(' e '))}.</span>`;
  else if (blocked) markup = '<strong>Publicação bloqueada</strong><span>Uma Tier List pública precisa ter pelo menos um herói classificado. Salve como rascunho, adicione as entradas e publique depois.</span>';
  else if (publishing) markup = `<strong>Pronta para o site</strong><span>${count} herói(s) classificados nesta lista.</span>`;
  else markup = `<strong>Rascunho</strong><span>${count} herói(s) já classificados; a lista ainda não aparece no site.</span>`;
  applyReadiness(box,tone,markup);
}

function bindFormReadiness() {
  document.querySelectorAll('[data-editorial-form]').forEach(form => {
    const update = () => renderEditorialReadiness(form);
    form.addEventListener('input',update);
    form.addEventListener('change',update);
    form.addEventListener(EDITORIAL_STATE_EVENT,update);
    // Nunca observe childList neste form: update() escreve a caixa de prontidão
    // dentro dele e um observer autorreferente bloquearia a thread principal.
    update();
  });
  const tier = document.getElementById('tier-form');
  if (tier) {
    const update = () => renderTierReadiness(tier);
    tier.addEventListener('input',update);
    tier.addEventListener('change',update);
    document.getElementById('tier-entry-list') && new MutationObserver(update).observe(document.getElementById('tier-entry-list'),{childList:true,subtree:true});
    update();
  }
}

bindHashTabs();
bindFormReadiness();
renderOverview().catch(error => {
  console.warn('[content-modules-polish] Falha ao carregar visão geral:',error);
  const target = document.getElementById('content-hub-message');
  if (target) {
    target.textContent = `Não foi possível atualizar os contadores dos módulos: ${error?.message || String(error)}`;
    target.className = 'content-hub-message show error';
  }
});
window.addEventListener('focus',()=>renderOverview().catch(()=>{}));
