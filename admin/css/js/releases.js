import { supabase } from '../../js/supabase.js?v=20260823-security-supabase-pin-1';

const list = document.getElementById('release-list');
const form = document.getElementById('release-form');
const message = document.getElementById('release-message');
const formStatus = document.getElementById('release-form-status');
const newButton = document.getElementById('release-new');
const resetButton = document.getElementById('release-reset');
let row = null;
let releases = [];

const esc = (value = '') => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
const versionPattern = /^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i;

function setMessage(text = '', type = '') { if (!message) return; message.textContent = text; message.className = `release-status${type ? ` ${type}` : ''}`; }
function setFormStatus(text = '', type = '') { if (!formStatus) return; formStatus.textContent = text; formStatus.className = `release-status${type ? ` ${type}` : ''}`; }
function asLocalDate(value) { if (!value) return ''; const date = new Date(value); if (Number.isNaN(date.getTime())) return ''; const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000); return local.toISOString().slice(0,16); }
function normalize(item = {}) { return { version:String(item.version||'').trim(), kind:String(item.kind||'improvement'), title:String(item.title||'').trim(), summary:String(item.summary||'').trim(), description:String(item.description||'').trim(), released_at:item.released_at||null, published:item.published!==false, highlights:Array.isArray(item.highlights)?item.highlights.map(v=>String(v).trim()).filter(Boolean):[] }; }
function sorted(items = releases) { return [...items].sort((a,b)=>new Date(b.released_at||0)-new Date(a.released_at||0)); }

function render() {
  const items = sorted();
  if (!items.length) { list.innerHTML = '<div class="release-status">Nenhuma versão cadastrada.</div>'; return; }
  list.innerHTML = items.map(item => `<button class="release-item" type="button" data-version="${esc(item.version)}"><strong>${esc(item.version)} · ${esc(item.title)}</strong><span>${esc(item.kind)} · ${item.published?'publicada':'rascunho'} · ${item.released_at ? new Date(item.released_at).toLocaleDateString('pt-BR') : 'sem data'}</span></button>`).join('');
  list.querySelectorAll('[data-version]').forEach(button => button.addEventListener('click', () => fill(button.dataset.version)));
}

function reset() {
  form.reset();
  form.elements.original_version.value = '';
  form.elements.kind.value = 'improvement';
  form.elements.published.checked = true;
  form.elements.released_at.value = asLocalDate(new Date().toISOString());
  list.querySelectorAll('.release-item').forEach(item=>item.classList.remove('active'));
  setFormStatus('Nova versão pronta para preenchimento.');
}

function fill(version) {
  const item = releases.find(entry => entry.version === version); if (!item) return;
  form.elements.original_version.value = item.version;
  form.elements.version.value = item.version;
  form.elements.kind.value = item.kind;
  form.elements.released_at.value = asLocalDate(item.released_at);
  form.elements.published.checked = item.published;
  form.elements.title.value = item.title;
  form.elements.summary.value = item.summary;
  form.elements.description.value = item.description;
  form.elements.highlights.value = item.highlights.join('\n');
  list.querySelectorAll('.release-item').forEach(node=>node.classList.toggle('active',node.dataset.version===version));
  setFormStatus(`Editando ${item.version}.`);
}

async function load() {
  setMessage('Carregando histórico…');
  const { data, error } = await supabase.from('site_pages').select('*').eq('page_key','versions').maybeSingle();
  if (error) { console.error('[releases]',error); setMessage(error.message||'Falha ao carregar versões.','error'); return; }
  row = data;
  releases = (Array.isArray(data?.content?.releases) ? data.content.releases : []).map(normalize).filter(item=>item.version);
  render(); reset(); setMessage('Histórico público sincronizado.','ok');
}

function collect() {
  const data = new FormData(form);
  const item = normalize({
    version:data.get('version'), kind:data.get('kind'), title:data.get('title'), summary:data.get('summary'), description:data.get('description'),
    released_at:data.get('released_at') ? new Date(String(data.get('released_at'))).toISOString() : null,
    published:form.elements.published.checked,
    highlights:String(data.get('highlights')||'').split(/\r?\n/).map(v=>v.trim()).filter(Boolean)
  });
  if (!versionPattern.test(item.version)) throw new Error('Use versão no formato 0.2.0 ou 0.2.0-beta.');
  if (item.title.length < 3 || item.summary.length < 10 || item.description.length < 20) throw new Error('Título, resumo e descrição precisam explicar a atualização com clareza.');
  if (!item.released_at) throw new Error('Informe a data pública da versão.');
  return item;
}

form?.addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const item = collect();
    const original = String(form.elements.original_version.value||'').trim();
    if (!original && releases.some(entry=>entry.version===item.version)) throw new Error('Essa versão já existe. Edite o registro existente.');
    if (original && original !== item.version && releases.some(entry=>entry.version===item.version)) throw new Error('Já existe outra versão com esse número.');
    const next = releases.filter(entry=>entry.version!==original);
    next.push(item);
    const publicItems = sorted(next).filter(entry=>entry.published);
    const content = { ...(row?.content||{}), title:'Versões & Evolução', subtitle:'Acompanhe o que mudou no Echo Arena.', releases:sorted(next), current_version:publicItems[0]?.version || String(row?.content?.current_version||'BETA') };
    const { data:{ user } } = await supabase.auth.getUser();
    const payload = { page_key:'versions', content, published:true, updated_at:new Date().toISOString(), updated_by:user?.id||null };
    const { data: saved, error } = await supabase.from('site_pages').upsert(payload,{onConflict:'page_key'}).select('*').single();
    if (error) throw error;
    row=saved; releases=sorted(next); render(); fill(item.version); setMessage(`Versão ${item.version} salva.`, 'ok'); setFormStatus('Alteração publicada no histórico conforme o estado selecionado.','ok');
  } catch (error) { console.error('[releases save]',error); setFormStatus(error.message||'Não foi possível salvar.','error'); }
});

newButton?.addEventListener('click',reset); resetButton?.addEventListener('click',reset);
await load();
