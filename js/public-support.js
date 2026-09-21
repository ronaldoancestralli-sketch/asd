import { supabase } from './supabase.js?v=20260823-security-supabase-pin-1';
import './public-beta-banner.js?v=20260822-beta-1&sb=20260823-security-supabase-pin-1&ops=20260905&sc=20260906-1&eq=20260907-effects-1';

const form = document.getElementById('support-form');
const status = document.getElementById('support-status');
const kindField = document.getElementById('support-kind');
const subjectField = document.getElementById('support-subject');
const messageField = document.getElementById('support-message');
let contactEmail = '';

const params = new URLSearchParams(location.search);
const requestedKind = params.get('tipo');
const kindMap = { contato:'contact', problema:'bug', sugestao:'suggestion', contact:'contact', bug:'bug', suggestion:'suggestion' };
if (kindMap[requestedKind] && kindField) kindField.value = kindMap[requestedKind];

function setStatus(text = '', type = '') {
  if (!status) return;
  status.textContent = text;
  status.className = `trust-status${type ? ` ${type}` : ''}`;
}

function labelOf(kind) {
  return ({ contact:'Contato', bug:'Relato de problema', suggestion:'Sugestão' })[kind] || 'Contato';
}

async function loadContact() {
  try {
    const { data, error } = await supabase.from('system_settings').select('contact_email').limit(1).maybeSingle();
    if (error) throw error;
    contactEmail = String(data?.contact_email || '').trim();
    if (!contactEmail) setStatus('O canal de contato ainda não foi configurado.', 'error');
  } catch (error) {
    console.error('[suporte] contato indisponível:', error);
    setStatus('Não foi possível carregar o canal de contato agora.', 'error');
  }
}

form?.addEventListener('submit', async event => {
  event.preventDefault();
  if (!contactEmail) await loadContact();
  if (!contactEmail) return;

  const data = new FormData(form);
  const kind = String(data.get('kind') || 'contact');
  const name = String(data.get('name') || '').trim();
  const reply = String(data.get('email') || '').trim();
  const subject = String(data.get('subject') || '').trim();
  const message = String(data.get('message') || '').trim();
  if (subject.length < 3 || message.length < 10) {
    setStatus('Informe um assunto e descreva a mensagem com um pouco mais de detalhe.', 'error');
    return;
  }

  const body = [
    `Tipo: ${labelOf(kind)}`,
    name ? `Nome: ${name}` : '',
    reply ? `E-mail para resposta: ${reply}` : '',
    `Página: ${location.origin}${location.pathname}`,
    '',
    message
  ].filter(Boolean).join('\n');
  const mailSubject = `[Echo Arena Beta] ${labelOf(kind)} · ${subject}`;
  const href = `mailto:${encodeURIComponent(contactEmail)}?subject=${encodeURIComponent(mailSubject)}&body=${encodeURIComponent(body)}`;
  setStatus('Abrindo seu aplicativo de e-mail para concluir o envio.', 'ok');
  location.href = href;
});

kindField?.addEventListener('change', () => {
  if (!subjectField || subjectField.value.trim()) return;
  subjectField.placeholder = kindField.value === 'bug' ? 'Ex.: botão não responde no iPhone' : kindField.value === 'suggestion' ? 'Ex.: ideia para melhorar a página de builds' : 'Assunto da mensagem';
});

loadContact();
