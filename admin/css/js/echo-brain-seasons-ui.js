import { loadBrainSnapshot } from './echo-brain-core.js?v=20260822-brain-final-1&sb=20260823-security-supabase-pin-1';
import { setBrainActiveSeason, upsertBrainSeason } from './echo-brain-actions.js?v=20260822-brain-seasons-1&sb=20260823-security-supabase-pin-1';

const esc=(value='')=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
const $=id=>document.getElementById(id);
let snapshot=null;
let editingId=null;
let slugTouched=false;

function slugify(value=''){return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80);}
function formatDate(value){if(!value)return'Sem data';const date=new Date(value);return Number.isNaN(date.getTime())?'Data inválida':date.toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'});}
function toLocalInput(value){if(!value)return'';const d=new Date(value);if(Number.isNaN(d.getTime()))return'';const pad=n=>String(n).padStart(2,'0');return`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;}
function inputIso(id){const value=$(id)?.value||'';if(!value)return null;const date=new Date(value);if(Number.isNaN(date.getTime()))throw new Error('season_date_invalid');return date.toISOString();}
function setText(id,value){const node=$(id);if(node)node.textContent=value;}
function setMessage(value,tone=''){const node=$('brain-seasons-message');if(!node)return;node.textContent=value;node.dataset.tone=tone;}

function ensureSection(){
  let section=$('brain-seasons-section');if(section)return section;
  section=document.createElement('section');section.id='brain-seasons-section';section.className='brain-section brain-seasons-section';
  section.innerHTML=`
    <header class="brain-section-head"><div><span>CONTEXTO COMPETITIVO</span><h3>Temporadas e versão do jogo</h3><p>Cada observação do Brain pertence a uma temporada. Apenas uma pode ficar ativa, evitando que patches diferentes sejam tratados como o mesmo contexto.</p></div><small id="brain-seasons-status">Sincronizando temporadas</small></header>
    <div class="brain-seasons-summary">
      <article><span>Temporadas</span><strong id="brain-seasons-count">—</strong><small>contextos cadastrados</small></article>
      <article><span>Temporada ativa</span><strong id="brain-seasons-active">—</strong><small id="brain-seasons-active-version">nenhuma versão ativa</small></article>
      <article><span>Pipeline</span><strong id="brain-seasons-pipeline">BLOQUEADO</strong><small id="brain-seasons-pipeline-copy">cadastre uma temporada para importar partidas</small></article>
    </div>
    <div class="brain-seasons-grid">
      <div class="brain-seasons-list-wrap">
        <div class="brain-seasons-title"><div><span>HISTÓRICO DE CONTEXTO</span><strong>Temporadas cadastradas</strong></div><small>Sem exclusão pelo Brain</small></div>
        <div id="brain-seasons-list" class="brain-seasons-list"><div class="dashboard-empty">Nenhuma temporada cadastrada.</div></div>
      </div>
      <form id="brain-season-form" class="brain-season-form" novalidate>
        <div class="brain-seasons-title"><div><span id="brain-season-form-kicker">NOVA TEMPORADA</span><strong id="brain-season-form-title">Cadastrar contexto competitivo</strong></div><small>ativação é uma ação separada</small></div>
        <input id="brain-season-id" type="hidden">
        <div class="brain-season-fields">
          <label><span>Nome</span><input id="brain-season-name" type="text" maxlength="80" autocomplete="off" placeholder="Ex.: Temporada 2026.3" required></label>
          <label><span>Slug</span><input id="brain-season-slug" type="text" maxlength="80" autocomplete="off" placeholder="temporada-2026-3" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required></label>
          <label><span>Versão do jogo</span><input id="brain-season-version" type="text" maxlength="40" autocomplete="off" placeholder="Ex.: 1.8.0" required></label>
          <label><span>Início · opcional</span><input id="brain-season-start" type="datetime-local"></label>
          <label><span>Fim · opcional</span><input id="brain-season-end" type="datetime-local"></label>
          <label class="brain-season-wide"><span>Notas · opcional</span><textarea id="brain-season-notes" rows="3" maxlength="500" placeholder="Mudanças de patch ou contexto que afetem a leitura competitiva."></textarea></label>
        </div>
        <p class="brain-season-hint">Salvar nunca ativa automaticamente a temporada. Depois do cadastro, use <b>Ativar temporada</b> explicitamente. A troca é atômica e o banco garante no máximo uma ativa.</p>
        <div class="brain-season-actions"><button id="brain-season-save" class="admin-button" type="submit">Cadastrar temporada</button><button id="brain-season-cancel" class="admin-button" type="button" hidden>Cancelar edição</button></div>
      </form>
    </div>
    <div id="brain-seasons-message" class="brain-learning-note" role="status" aria-live="polite"></div>`;
  const finalSection=$('brain-final-section');if(finalSection)finalSection.insertAdjacentElement('beforebegin',section);else $('brain-emergency-panel')?.insertAdjacentElement('afterend',section);
  return section;
}

function renderSummary(data){const rows=data.seasons?.rows||[],active=data.seasons?.active||null;setText('brain-seasons-count',String(rows.length));setText('brain-seasons-active',active?.name||'NENHUMA');setText('brain-seasons-active-version',active?`${active.game_version} · ${active.slug}`:'nenhuma versão ativa');setText('brain-seasons-pipeline',rows.length?'PRONTO':'BLOQUEADO');setText('brain-seasons-pipeline-copy',rows.length?active?'temporada ativa disponível para novos lotes':'há contexto cadastrado; escolha a temporada no lote':'cadastre uma temporada para importar partidas');setText('brain-seasons-status',active?`${active.name} · ${active.game_version}`:rows.length?`${rows.length} cadastrada(s) · nenhuma ativa`:'Nenhuma temporada cadastrada');}

function seasonRow(season,emergency){const period=season.starts_at||season.ends_at?`${formatDate(season.starts_at)} → ${season.ends_at?formatDate(season.ends_at):'em aberto'}`:'Período não informado';return `<article class="brain-season-row" data-season-id="${esc(season.id)}" data-active="${season.active?'true':'false'}"><div class="brain-season-main"><div class="brain-season-heading"><strong>${esc(season.name)}</strong>${season.active?'<span>ATIVA</span>':''}</div><small>${esc(season.game_version)} · ${esc(season.slug)}</small><p>${esc(period)}${season.notes?` · ${esc(season.notes)}`:''}</p></div><div class="brain-season-row-actions"><button class="admin-button" type="button" data-season-edit="${esc(season.id)}">Editar</button><button class="admin-button ${season.active?'danger':''}" type="button" data-season-active="${esc(season.id)}" data-next="${season.active?'off':'on'}" ${emergency?'disabled aria-disabled="true"':''}>${season.active?'Desativar':'Ativar temporada'}</button></div></article>`;}
function renderList(data){const host=$('brain-seasons-list');if(!host)return;const rows=data.seasons?.rows||[],emergency=data.runtime?.settings?.emergency_enabled===true;host.innerHTML=rows.length?rows.map(season=>seasonRow(season,emergency)).join(''):'<div class="dashboard-empty">Nenhuma temporada existe ainda. O Brain não vai inventar uma: cadastre somente quando nome e versão reais estiverem definidos.</div>';const save=$('brain-season-save');if(save)save.disabled=emergency;if(emergency)setMessage('Modo de emergência ativo: alterações de temporada ficam bloqueadas nesta interface.','warning');}
function render(data){snapshot=data;ensureSection();renderSummary(data);renderList(data);}

function resetForm(){editingId=null;slugTouched=false;const form=$('brain-season-form');form?.reset();if($('brain-season-id'))$('brain-season-id').value='';setText('brain-season-form-kicker','NOVA TEMPORADA');setText('brain-season-form-title','Cadastrar contexto competitivo');setText('brain-season-save','Cadastrar temporada');const cancel=$('brain-season-cancel');if(cancel)cancel.hidden=true;}
function editSeason(id){const season=(snapshot?.seasons?.rows||[]).find(row=>row.id===id);if(!season)return;editingId=id;slugTouched=true;$('brain-season-id').value=id;$('brain-season-name').value=season.name||'';$('brain-season-slug').value=season.slug||'';$('brain-season-version').value=season.game_version||'';$('brain-season-start').value=toLocalInput(season.starts_at);$('brain-season-end').value=toLocalInput(season.ends_at);$('brain-season-notes').value=season.notes||'';setText('brain-season-form-kicker','EDITAR TEMPORADA');setText('brain-season-form-title',season.name||'Editar contexto competitivo');setText('brain-season-save','Salvar alterações');$('brain-season-cancel').hidden=false;$('brain-season-form')?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});}

async function saveSeason(event){event.preventDefault();if(snapshot?.runtime?.settings?.emergency_enabled===true){setMessage('Alteração bloqueada enquanto o modo de emergência estiver ativo.','warning');return;}const name=$('brain-season-name')?.value.trim()||'',slug=$('brain-season-slug')?.value.trim().toLowerCase()||'',gameVersion=$('brain-season-version')?.value.trim()||'',notes=$('brain-season-notes')?.value.trim()||'';if(name.length<2){setMessage('Informe um nome de temporada válido.','warning');$('brain-season-name')?.focus();return;}if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)){setMessage('O slug deve usar apenas letras minúsculas, números e hífens.','warning');$('brain-season-slug')?.focus();return;}if(!gameVersion){setMessage('Informe a versão real do jogo para esta temporada.','warning');$('brain-season-version')?.focus();return;}let startsAt=null,endsAt=null;try{startsAt=inputIso('brain-season-start');endsAt=inputIso('brain-season-end');}catch{setMessage('Revise as datas informadas.','warning');return;}if(startsAt&&endsAt&&new Date(endsAt)<=new Date(startsAt)){setMessage('O fim da temporada precisa ser posterior ao início.','warning');return;}const label=editingId?'Salvar alterações desta temporada em produção?':'Cadastrar esta temporada em produção? Ela permanecerá inativa até uma ação separada.';if(!window.confirm(label))return;const button=$('brain-season-save');button.disabled=true;setMessage(editingId?'Salvando temporada…':'Cadastrando temporada…');try{await upsertBrainSeason({id:editingId,name,slug,gameVersion,startsAt,endsAt,notes});setMessage(editingId?'Temporada atualizada. Nenhuma ativação foi alterada.':'Temporada cadastrada como inativa. Agora ela pode ser escolhida no pipeline ou ativada explicitamente.','success');setTimeout(()=>location.reload(),700);}catch(error){console.error('[echo-brain-seasons] save:',error);const msg=String(error?.message||'');setMessage(msg.includes('slug_already_exists')||msg.includes('duplicate')?'Já existe uma temporada com esse slug.':'Não foi possível salvar a temporada. Nenhuma ativação foi alterada.','danger');button.disabled=false;}}

async function toggleSeason(id,next){if(snapshot?.runtime?.settings?.emergency_enabled===true){setMessage('Alteração bloqueada enquanto o modo de emergência estiver ativo.','warning');return;}const season=(snapshot?.seasons?.rows||[]).find(row=>row.id===id);if(!season)return;const enabling=next==='on',copy=enabling?`Ativar “${season.name}” como contexto competitivo atual? Se houver outra temporada ativa, ela será desativada na mesma transação.`:`Desativar “${season.name}”? O Brain ficará sem temporada ativa até uma nova ativação explícita.`;if(!window.confirm(copy))return;setMessage(enabling?'Ativando temporada e encerrando qualquer contexto ativo anterior…':'Desativando temporada…');try{await setBrainActiveSeason(id,enabling);setMessage(enabling?'Temporada ativa atualizada. O pipeline já pode usá-la como padrão.':'Temporada desativada. Nenhuma outra foi ativada automaticamente.','success');setTimeout(()=>location.reload(),650);}catch(error){console.error('[echo-brain-seasons] active:',error);setMessage('Não foi possível alterar a temporada ativa. O banco preservou o estado anterior.','danger');}}

function bind(){const form=$('brain-season-form');if(form?.dataset.bound==='true')return;if(form)form.dataset.bound='true';$('brain-season-name')?.addEventListener('input',event=>{if(slugTouched)return;const slug=$('brain-season-slug');if(slug)slug.value=slugify(event.target.value);});$('brain-season-slug')?.addEventListener('input',()=>{slugTouched=true;});form?.addEventListener('submit',saveSeason);$('brain-season-cancel')?.addEventListener('click',resetForm);$('brain-seasons-list')?.addEventListener('click',event=>{const edit=event.target.closest('[data-season-edit]');if(edit){editSeason(edit.dataset.seasonEdit);return;}const active=event.target.closest('[data-season-active]');if(active)toggleSeason(active.dataset.seasonActive,active.dataset.next);});}

ensureSection();
try{render(await loadBrainSnapshot());bind();}catch(error){console.error('[echo-brain-seasons] snapshot:',error);setText('brain-seasons-status','Temporadas indisponíveis');setMessage('Não foi possível carregar o contexto de temporadas. Nenhum dado foi alterado.','danger');}
