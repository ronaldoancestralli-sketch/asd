import { resolveExternalDataEffect } from '../../js/equipment-data-limits.js?v=2';
import {
  refreshEquipmentAttributeClassifications,
  resolvePersistedAttributeClassification
} from '../../js/equipment-attribute-classifications.js?v=2&sb=20260823-security-supabase-pin-1';

let scheduled = false;

function resolveAnyExternal(rawLabel = '') {
  const persisted = resolvePersistedAttributeClassification(rawLabel);
  if (persisted?.classification === 'external_data_required') {
    return {
      id: `persisted:${persisted.normalizedKey}`,
      label: persisted.label,
      reason: persisted.reason,
      missingData: persisted.missingData,
      publicNote: persisted.publicNote,
      persisted: true
    };
  }
  const staticEffect = resolveExternalDataEffect(rawLabel);
  return staticEffect ? { ...staticEffect, persisted: false } : null;
}

function summaryKey(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function ensureStyles() {
  if (document.getElementById('audit-external-data-style')) return;
  const style = document.createElement('style');
  style.id = 'audit-external-data-style';
  style.textContent = `
    .audit-item.external-data{border-color:rgba(251,191,36,.38)!important;background:linear-gradient(180deg,rgba(120,83,8,.08),rgba(7,16,29,.94))!important}.audit-item.external-data .audit-kicker{color:#fbbf24!important}.audit-item.external-data .audit-status{color:#fde68a!important;border-color:#76591c!important;background:rgba(120,83,8,.12)!important}.audit-item.external-data .audit-answer{border-color:rgba(118,89,28,.55)!important}.audit-summary-card.external-data{border-color:#76591c!important;background:linear-gradient(145deg,rgba(120,83,8,.12),rgba(8,17,31,.96))!important}.audit-summary-card.external-data small,.audit-summary-card.external-data strong{color:#fde68a!important}.audit-summary-card.external-data span{color:#a99d74!important}.audit-external-origin{display:block;margin-top:5px;color:#8f876a!important;font-size:8px!important}
  `;
  document.head.appendChild(style);
}

function ensureSummaryCard() {
  const summary = document.querySelector('.audit-summary');
  if (!summary || document.getElementById('sum-external-data')) return;
  const card = document.createElement('article');
  card.className = 'audit-summary-card external-data';
  card.innerHTML = '<small>Aguardando dado oficial</small><strong id="sum-external-data">0</strong><span>Regras únicas de efeitos reais sem base pública suficiente para cálculo. Não contam como erro.</span>';
  summary.appendChild(card);
}

function answerByLabel(card, label) {
  return [...card.querySelectorAll('.audit-answer')].find(answer =>
    answer.querySelector('small')?.textContent?.trim().toUpperCase() === label
  );
}

function applyCard(card, effect) {
  if (card.dataset.externalDataProcessed !== effect.id) {
    card.dataset.externalDataProcessed = effect.id;
    card.classList.add('external-data');
    card.classList.remove('bad');

    const status = card.querySelector('.audit-status');
    if (status) {
      status.className = 'audit-status warn';
      status.textContent = 'Aguardando dado oficial — não é erro';
    }

    const found = answerByLabel(card, 'O QUE ENCONTRAMOS?');
    if (found) {
      const strong = found.querySelector('strong');
      const span = found.querySelector('span');
      if (strong) strong.textContent = effect.label;
      if (span) {
        span.textContent = 'O modificador existe no equipamento e foi identificado como uma mecânica real do jogo.';
        if (!found.querySelector('.audit-external-origin')) {
          const origin = document.createElement('span');
          origin.className = 'audit-external-origin';
          origin.textContent = effect.persisted
            ? 'Classificação salva pela equipe na Auditoria.'
            : 'Classificação conhecida pelo catálogo do projeto.';
          found.appendChild(origin);
        }
      }
    }

    const working = answerByLabel(card, 'ESTÁ FUNCIONANDO?');
    if (working) {
      const strong = working.querySelector('strong');
      const span = working.querySelector('span');
      if (strong) strong.textContent = 'Registrado, mas sem cálculo final.';
      if (span) span.textContent = 'O valor é preservado e pode ser exibido, porém o motor não cria uma estimativa sem um valor-base oficial confiável.';
    }

    const why = answerByLabel(card, 'POR QUÊ?');
    if (why?.querySelector('span')) why.querySelector('span').textContent = effect.reason;

    const action = answerByLabel(card, 'O QUE PRECISO FAZER?');
    if (action?.querySelector('span')) {
      action.querySelector('span').textContent = `Nenhuma correção é necessária no cadastro. Aguarde uma fonte oficial confiável. O que falta: ${effect.missingData || 'dados-base oficiais suficientes para o cálculo.'}`;
    }

    const targetRow = [...card.querySelectorAll('.audit-tech-row')].find(row =>
      row.querySelector('span')?.textContent?.toLowerCase().includes('destino reconhecido')
    );
    if (targetRow?.querySelector('code')) {
      targetRow.querySelector('code').textContent = 'Resultado final indisponível · aguardando base oficial';
    }
  }

  // A fila persistente já exibe estes casos em um bloco amarelo próprio.
  // Evita que a mesma regra apareça novamente entre as correções vermelhas.
  if (card.closest('#pending-results')) card.hidden = true;
}

function adjustSummaryCounter(id, subtract) {
  const node = document.getElementById(id);
  if (!node) return;

  const current = Number(String(node.textContent || '').replace(/\D/g, ''));
  const previousAdjusted = Number(node.dataset.auditExternalLastAdjusted);
  let base = Number(node.dataset.auditExternalBase);

  if (!Number.isFinite(base) || !Number.isFinite(previousAdjusted) || current !== previousAdjusted) {
    base = Number.isFinite(current) ? current : 0;
  }

  const adjusted = Math.max(0, base - subtract);
  node.dataset.auditExternalBase = String(base);
  node.dataset.auditExternalLastAdjusted = String(adjusted);
  if (node.textContent !== String(adjusted)) node.textContent = String(adjusted);
}

function collectBonusExternalKeys() {
  const keys = new Set();

  document.querySelectorAll('[data-external-data-count]').forEach((card, cardIndex) => {
    const externalBlock = [...card.querySelectorAll('.audit-flow-card')].find(block =>
      block.querySelector('small')?.textContent?.trim().toUpperCase() === 'EFEITOS PRESERVADOS FORA DO CÁLCULO'
    );
    const labels = externalBlock
      ? [...externalBlock.querySelectorAll('.audit-effect span')]
          .map(node => node.textContent?.trim())
          .filter(Boolean)
      : [];

    if (labels.length) {
      labels.forEach(label => keys.add(`effect:${summaryKey(label)}`));
      return;
    }

    // Fallback conservador caso a marcação visual mude no futuro: preserva
    // a contagem informada pelo cartão sem inventar o significado do efeito.
    const count = Number(card.dataset.externalDataCount || 0);
    for (let index = 0; index < count; index += 1) {
      keys.add(`bonus:${cardIndex}:${index}`);
    }
  });

  return keys;
}

function processCards() {
  scheduled = false;
  ensureSummaryCard();
  const attributeExternalCards = [];
  const uniqueExternalKeys = collectBonusExternalKeys();

  document.querySelectorAll('.audit-item').forEach(card => {
    // Bônus de conjunto já chegam classificados pelo audit-v4 e informam
    // a quantidade de efeitos externos em data-external-data-count.
    if (card.hasAttribute('data-external-data-count')) return;

    const heading = card.querySelector('h3')?.textContent?.trim() || '';
    const effect = resolveAnyExternal(heading);
    if (!effect) return;
    attributeExternalCards.push(card);
    uniqueExternalKeys.add(`effect:${summaryKey(effect.label || effect.id)}`);
    applyCard(card, effect);
  });

  const externalSummary = document.getElementById('sum-external-data');
  const totalExternal = uniqueExternalKeys.size;
  if (externalSummary && externalSummary.textContent !== String(totalExternal)) {
    externalSummary.textContent = String(totalExternal);
  }

  // O audit-v4 ainda considera uma regra de atributo desconhecida antes desta
  // camada reconhecer a classificação externa. Corrige somente os atributos;
  // bônus externos já são tratados nativamente e não entram nestes contadores.
  adjustSummaryCounter('sum-not-calculated', attributeExternalCards.length);
  adjustSummaryCounter('sum-attention', attributeExternalCards.length);
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  window.requestAnimationFrame(processCards);
}

ensureStyles();
await refreshEquipmentAttributeClassifications();
schedule();
new MutationObserver(schedule).observe(document.getElementById('audit-page') || document.body, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['class', 'hidden', 'data-external-data-count']
});
