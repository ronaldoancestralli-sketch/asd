import { supabase } from './supabase.js?v=20260823-security-supabase-pin-1';

const $ = id => document.getElementById(id);
const LOCAL_KEY = 'echo-arena-saved-comparisons';

let session = null;
let left = null;
let persistedRightIds = new Set();
let initialized = false;

function showToast(message) {
  const element = $('toast');
  if (!element) return;
  const copy = element.querySelector('span');
  if (copy) copy.textContent = message;
  element.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { element.hidden = true; }, 2800);
}

function readDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem('echo-arena-build-draft') || 'null');
    if (!draft?.heroId || !Array.isArray(draft.items)) return null;
    return {
      id: 'local-draft',
      hero_id: draft.heroId,
      title: draft.title || 'Build sem título',
      visibility: draft.visibility || 'private',
      status: draft.status || 'draft',
      is_public: false,
      deleted_at: null,
      source: 'draft'
    };
  } catch {
    return null;
  }
}

async function fetchBuild(id) {
  if (!id) return null;
  const { data, error } = await supabase.from('builds')
    .select('id,user_id,hero_id,title,is_public,visibility,status,deleted_at,updated_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? { ...data, source: 'saved' } : null;
}

async function resolveLeftBuild() {
  const params = new URLSearchParams(location.search);
  const draft = readDraft();

  if (params.get('draft') === '1' && draft) return draft;

  const requested = await fetchBuild(params.get('build'));
  if (requested) return requested;

  if (draft) return draft;
  if (!session?.user?.id) return null;

  const { data, error } = await supabase.from('builds')
    .select('id,user_id,hero_id,title,is_public,visibility,status,deleted_at,updated_at')
    .eq('user_id', session.user.id)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? { ...data, source: 'saved' } : null;
}

function selectedOpponentId() {
  return document.querySelector('#build-options [data-build].selected')?.dataset.build || null;
}

function comparisonKey() {
  return `${left?.id || 'draft'}:${selectedOpponentId() || ''}`;
}

function readLocalSaved() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
  } catch {
    return [];
  }
}

function localSaved() {
  const key = comparisonKey();
  return Boolean(key && readLocalSaved().some(entry => entry.key === key));
}

function setSaveButton(saved, mode = 'account') {
  const button = $('save-comparison');
  if (!button) return;
  button.classList.toggle('saved', saved);
  const label = button.querySelector('span');
  if (!label) return;
  if (saved) label.textContent = mode === 'device' ? 'Salva neste dispositivo' : 'Comparação salva';
  else label.textContent = 'Salvar comparação';
}

async function loadPersisted() {
  persistedRightIds = new Set();
  if (!session?.user?.id || !left?.id || left.id === 'local-draft') return;

  const { data, error } = await supabase.from('build_comparisons')
    .select('right_build_id')
    .eq('left_build_id', left.id);
  if (error) throw error;
  persistedRightIds = new Set((data || []).map(row => row.right_build_id));
}

function syncSaveButton() {
  const rightId = selectedOpponentId();
  if (!rightId || !left) return setSaveButton(false);

  if (session?.user?.id && left.id !== 'local-draft') {
    setSaveButton(persistedRightIds.has(rightId), 'account');
  } else {
    setSaveButton(localSaved(), 'device');
  }
}

function toggleLocal() {
  const saved = readLocalSaved();
  const key = comparisonKey();
  if (!key || !left || !selectedOpponentId()) return false;
  const exists = saved.some(entry => entry.key === key);
  const next = exists
    ? saved.filter(entry => entry.key !== key)
    : [...saved, {
      key,
      mineBuildId: left.id === 'local-draft' ? null : left.id,
      draft: left.id === 'local-draft',
      opponentBuildId: selectedOpponentId(),
      heroId: left.hero_id,
      savedAt: new Date().toISOString()
    }];
  localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
  return !exists;
}

async function handleSave(event) {
  event.preventDefault();
  event.stopImmediatePropagation();

  const rightId = selectedOpponentId();
  if (!left || !rightId) {
    showToast('Selecione duas builds válidas antes de salvar.');
    return;
  }

  const button = $('save-comparison');
  if (button) button.disabled = true;
  try {
    if (!session?.user?.id || left.id === 'local-draft') {
      const saved = toggleLocal();
      setSaveButton(saved, 'device');
      showToast(saved
        ? 'Comparação salva somente neste dispositivo.'
        : 'Comparação removida deste dispositivo.');
      return;
    }

    const opponentTitle = document.querySelector('#build-options [data-build].selected strong')?.textContent?.trim() || '';
    const title = [left.title, opponentTitle].filter(Boolean).join(' × ') || null;
    const { data, error } = await supabase.rpc('toggle_saved_build_comparison', {
      p_left_build_id: left.id,
      p_right_build_id: rightId,
      p_title: title
    });
    if (error) throw error;

    const saved = Boolean(data?.saved);
    if (saved) persistedRightIds.add(rightId);
    else persistedRightIds.delete(rightId);
    setSaveButton(saved, 'account');
    showToast(saved ? 'Comparação salva na sua conta.' : 'Comparação removida da sua conta.');
  } catch (error) {
    console.error('[comparar-build-persistence] Falha ao salvar:', error);
    showToast('Não foi possível salvar a comparação agora.');
  } finally {
    if (button) button.disabled = false;
  }
}

async function handleShare(event) {
  event.preventDefault();
  event.stopImmediatePropagation();

  const rightId = selectedOpponentId();
  if (!left || !rightId) {
    showToast('Selecione duas builds válidas antes de compartilhar.');
    return;
  }

  if (left.id === 'local-draft') {
    showToast('Salve a sua build antes de gerar um link compartilhável.');
    return;
  }

  const publiclyReadable = left.is_public === true
    && left.visibility === 'public'
    && left.status === 'published'
    && !left.deleted_at;

  if (!publiclyReadable) {
    showToast('Somente uma build pública salva pode ser compartilhada externamente.');
    return;
  }

  const url = new URL(location.href);
  url.search = '';
  url.searchParams.set('build', left.id);
  url.searchParams.set('opponent', rightId);

  try {
    await navigator.clipboard.writeText(url.href);
    showToast('Link público da comparação copiado.');
  } catch (error) {
    console.warn('[comparar-build-persistence] Clipboard indisponível:', error);
    showToast('Não foi possível copiar o link neste navegador.');
  }
}

function watchOpponent() {
  const options = $('build-options');
  if (!options) return;
  const observer = new MutationObserver(() => syncSaveButton());
  observer.observe(options, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
}

async function boot() {
  if (initialized) return;
  initialized = true;

  const saveButton = $('save-comparison');
  const shareButton = $('share-comparison');
  if (!saveButton || !shareButton) return;

  // Captura antes dos listeners legados do comparador, substituindo somente
  // persistência/compartilhamento. O cálculo e a seleção continuam no módulo principal.
  saveButton.addEventListener('click', handleSave, { capture: true });
  shareButton.addEventListener('click', handleShare, { capture: true });
  watchOpponent();

  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    session = data.session || null;
    left = await resolveLeftBuild();
    await loadPersisted();
    syncSaveButton();
  } catch (error) {
    console.warn('[comparar-build-persistence] Persistência indisponível:', error?.message || error);
  }
}

boot();
