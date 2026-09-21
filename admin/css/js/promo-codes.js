import { supabase } from '../../js/supabase.js?v=20260823-security-supabase-pin-1';

const form=document.getElementById('promo-form');
const list=document.getElementById('promo-list');
const message=document.getElementById('promo-message');
const formStatus=document.getElementById('promo-form-status');
const submitButton=document.getElementById('promo-submit');
const removeButton=document.getElementById('promo-remove');
const previewButton=document.getElementById('promo-preview');
const editorTitle=document.getElementById('promo-editor-title');
const editorSubtitle=document.getElementById('promo-editor-subtitle');
const optionalDetails=form?.querySelector('.promo-options');

let rows=[];
let activeId=null;
let busy=false;

function setStatus(target,text='',kind=''){
  if(!target)return;
  target.textContent=text;
  target.className=target===formStatus
    ? `promo-form-status${kind?` ${kind}`:''}`
    : `promo-status${kind?` ${kind}`:''}`;
}

function escapeHtml(value=''){
  return String(value).replace(/[&<>"']/g,char=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  }[char]));
}

function maskCode(value=''){
  const code=String(value||'').trim();
  if(!code)return 'código protegido';
  if(code.length<=4)return '••••';
  return `${escapeHtml(code.slice(0,2))}${'•'.repeat(Math.min(8,Math.max(4,code.length-4)))}${escapeHtml(code.slice(-2))}`;
}

function toLocalInput(value){
  if(!value)return '';
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return '';
  const local=new Date(date.getTime()-date.getTimezoneOffset()*60000);
  return local.toISOString().slice(0,16);
}

function toIso(value){
  if(!value)return null;
  const date=new Date(value);
  return Number.isNaN(date.getTime())?null:date.toISOString();
}

function formatDate(value){
  if(!value)return 'horário não informado';
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return 'horário não informado';
  return date.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});
}

function sourceLabel(row){
  if(!row?.source_url)return 'Sem fonte vinculada';
  try{
    return `Fonte: ${new URL(row.source_url).hostname.replace(/^www\./,'')}`;
  }catch{
    return 'Fonte vinculada';
  }
}

function isExpired(row){
  if(row?.status==='expired')return true;
  if(!row?.expires_at)return false;
  const expiresAt=new Date(row.expires_at).getTime();
  return Number.isFinite(expiresAt)&&expiresAt<=Date.now();
}

function isLive(row){
  return Boolean(
    row?.published&&
    row?.status==='active'&&
    row?.verification_status==='verified'&&
    !isExpired(row)
  );
}

function statusCopy(row){
  if(isLive(row))return ['Publicado','live'];
  if(isExpired(row))return ['Expirado','expired'];
  return ['Removido','removed'];
}

function setBusy(next){
  busy=Boolean(next);
  form?.setAttribute('aria-busy',String(busy));
  [submitButton,removeButton,...list.querySelectorAll('button')].forEach(button=>{
    if(button)button.disabled=busy;
  });
}

function renderList(){
  if(!rows.length){
    list.innerHTML='<div class="promo-empty">Nenhum promocode cadastrado. Cole o primeiro código ao lado e publique.</div>';
    return;
  }

  list.innerHTML=rows.map(row=>{
    const [label,tone]=statusCopy(row);
    const author=row.created_by_name||'Administrador';
    const action=isLive(row)
      ? '<button type="button" class="promo-inline-button remove" data-remove>Remover do site</button>'
      : '<button type="button" class="promo-inline-button" data-edit>Editar e republicar</button>';

    return `<article class="promo-item ${row.id===activeId?'active':''}" data-id="${escapeHtml(row.id)}">
      <button type="button" class="promo-item-main" data-edit aria-label="Editar ${escapeHtml(row.title||'promocode')}">
        <div class="promo-item-head">
          <strong>${escapeHtml(row.title||'Novo código promocional de Bullet Echo')}</strong>
          <span class="promo-pill ${tone}">${escapeHtml(label)}</span>
        </div>
        <div class="promo-item-meta">
          <span>${maskCode(row.code)}</span>
          <span>${Number(row.likes_count||0)} curtida(s)</span>
          <span>${escapeHtml(sourceLabel(row))}</span>
          <span class="promo-author">Publicado por ${escapeHtml(author)} · ${escapeHtml(formatDate(row.created_at))}</span>
        </div>
      </button>
      <div class="promo-item-actions">
        <button type="button" class="promo-inline-button" data-edit>Editar</button>
        ${action}
      </div>
    </article>`;
  }).join('');

  if(busy)setBusy(true);
}

function updateEditorState(row=null){
  const live=isLive(row);
  const isEditing=Boolean(row);
  editorTitle.textContent=isEditing?'Editar promocode':'Publicar agora';
  editorSubtitle.textContent=isEditing
    ? (live?'Salve para atualizar o presente que já está no site.':'Salve para republicar esta campanha.')
    : 'O presente entra no site assim que o banco confirmar.';
  submitButton.textContent=isEditing
    ? (live?'Atualizar publicação':'Republicar agora')
    : 'Publicar agora';
  removeButton.hidden=!live;
}

function resetForm({focus=true}={}){
  activeId=null;
  form.reset();
  form.elements.id.value='';
  if(optionalDetails)optionalDetails.open=false;
  updateEditorState();
  setStatus(formStatus);
  renderList();
  if(focus)form.elements.code.focus({preventScroll:true});
}

function selectRow(id,{focus=true}={}){
  const row=rows.find(item=>item.id===id);
  if(!row)return;
  activeId=row.id;
  form.elements.id.value=row.id;
  form.elements.code.value=row.code||'';
  form.elements.reward.value=row.reward||'';
  form.elements.source_url.value=row.source_url||'';
  form.elements.title.value=row.title||'';
  form.elements.expires_at.value=toLocalInput(row.expires_at);
  if(optionalDetails){
    optionalDetails.open=Boolean(row.source_url||row.expires_at||row.title);
  }
  updateEditorState(row);
  setStatus(formStatus);
  renderList();
  if(focus)form.elements.code.focus({preventScroll:true});
}

async function load({announce=true}={}){
  if(announce)setStatus(message,'Carregando promocodes…');
  const {data,error}=await supabase.rpc('promo_admin_list');
  if(error){
    console.error('[promo-admin] load failed',error);
    setStatus(message,`Não foi possível carregar: ${error.message}`,'error');
    list.innerHTML='<div class="promo-status error">Falha ao carregar.</div>';
    return false;
  }

  rows=Array.isArray(data)?data:[];
  if(announce){
    const live=rows.filter(isLive).length;
    setStatus(message,rows.length
      ? `${live} no site · ${rows.length-live} removido(s)`
      : 'Nenhum promocode cadastrado.');
  }
  renderList();
  return true;
}

function payload(){
  const e=form.elements;
  return {
    p_code:e.code.value.trim(),
    p_id:e.id.value||null,
    p_title:e.title.value.trim()||null,
    p_reward:e.reward.value.trim()||null,
    p_source_url:e.source_url.value.trim()||null,
    p_expires_at:toIso(e.expires_at.value)
  };
}

function friendlyError(error,action='publicar'){
  const text=String(error?.message||'');
  if(text.includes('admin_aal2_required'))return 'Sua sessão administrativa precisa ser confirmada novamente antes de publicar.';
  if(text.includes('promo_code_required')||text.includes('invalid_promo_payload'))return 'Informe o código promocional.';
  if(text.includes('promo_source_url_invalid'))return 'O link da fonte precisa começar com https://. Você também pode deixá-lo vazio.';
  if(text.includes('promo_not_found'))return 'Esta campanha não existe mais. A lista será atualizada.';
  return `Não foi possível ${action}: ${text||'erro desconhecido'}`;
}

async function removeFromSite(id,{keepSelection=true}={}){
  if(!id||busy)return;
  setBusy(true);
  setStatus(id===activeId?formStatus:message,'Removendo do site…');
  const {data,error}=await supabase.rpc('promo_admin_remove',{p_promo_id:id});
  if(error){
    setStatus(id===activeId?formStatus:message,friendlyError(error,'remover'),'error');
    setBusy(false);
    return;
  }
  if(data!==true){
    setStatus(message,'A campanha já não estava disponível.','error');
  }
  await load({announce:false});
  if(keepSelection&&rows.some(row=>row.id===id))selectRow(id,{focus:false});
  else resetForm({focus:false});
  setStatus(message,'Promocode removido do site. O histórico e o autor foram preservados.','ok');
  setBusy(false);
}

form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(busy||!form.reportValidity())return;

  const data=payload();
  if(form.elements.expires_at.value&&!data.p_expires_at){
    setStatus(formStatus,'Informe uma data de validade válida ou deixe o campo vazio.','error');
    return;
  }

  setBusy(true);
  setStatus(formStatus,activeId?'Atualizando e publicando…':'Publicando…');
  const {data:id,error}=await supabase.rpc('promo_admin_publish',data);
  if(error){
    console.error('[promo-admin] publish failed',error);
    setStatus(formStatus,friendlyError(error),'error');
    setBusy(false);
    return;
  }

  activeId=id;
  const loaded=await load({announce:false});
  if(loaded&&activeId)selectRow(activeId,{focus:false});
  setStatus(formStatus,form.elements.id.value===id?'Promocode publicado. O autor ficou registrado.':'Promocode publicado.','ok');
  setStatus(message,'Publicação confirmada e disponível no site.','ok');
  setBusy(false);
});

list.addEventListener('click',event=>{
  const card=event.target.closest('[data-id]');
  if(!card||busy)return;
  const id=card.dataset.id;
  if(event.target.closest('[data-remove]')){
    removeFromSite(id,{keepSelection:id===activeId});
    return;
  }
  if(event.target.closest('[data-edit]'))selectRow(id);
});

removeButton.addEventListener('click',()=>removeFromSite(activeId));

previewButton?.addEventListener('click',()=>{
  const url=new URL('../index.html',location.href);
  url.searchParams.set('promo_preview','1');
  url.searchParams.set('preview_v','20260831-admin-preview-1');
  const opened=window.open(url.href,'_blank');
  if(opened)opened.opener=null;
  else location.href=url.href;
});

document.getElementById('promo-new')?.addEventListener('click',()=>resetForm());
document.getElementById('promo-reset')?.addEventListener('click',()=>resetForm());

resetForm({focus:false});
await load();
