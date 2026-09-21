/* Echo Arena — compatibilidade de bônus e apresentação de atributos.
   IMPORTANTE: este arquivo NÃO altera a fórmula do game-stat-engine.
   Ele apenas:
   1) converte bônus legados descritos em texto para stats estruturados;
   2) deixa explícito quando um marco de conjunto foi enviado ao cálculo;
   3) normaliza rótulos/descrições exibidos na interface. */
(() => {
  'use strict';

  const normalize = value => String(value ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9%+\-.,\s]/g, ' ')
    .replace(/\s+/g, ' ').trim();

  const compact = value => normalize(value).replace(/\s+/g, '');

  const numberFrom = value => {
    const n = Number(String(value ?? '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  };

  const hasStructuredStats = stats => Boolean(
    stats && typeof stats === 'object' && !Array.isArray(stats) && Object.keys(stats).length
  );

  const isPercentKey = key => /_pct$|percentual|porcentagem/.test(normalize(key));

  function canonicalLegacyKey(phrase, isPercent) {
    const p = normalize(phrase)
      .replace(/^ao\s+|^a\s+|^de\s+|^do\s+|^da\s+/, '')
      .replace(/\s+do heroi$/g, '')
      .replace(/\s+do inimigo$/g, '')
      .trim();
    const c = p.replace(/\s+/g, '');

    if (/dano.*(armadura|drone)/.test(p) || /dano.*(armadura|drone)/.test(c)) {
      return isPercent ? 'weapon_damage_to_armor_pct' : 'dano da arma a armadura do inimigo';
    }
    if (/dano.*vida/.test(p) || /dano.*vida/.test(c)) {
      return isPercent ? 'weapon_damage_to_health_pct' : 'dano da arma a vida do inimigo';
    }
    if (/(alcance|distancia).*visao/.test(p) || /(alcance|distancia).*visao/.test(c)) return 'alcance de visao do heroi';
    if (/alcance.*(tiro|arma).*mira|alcance.*com mira/.test(p) || /alcance.*mira/.test(c)) return 'weapon_range_franco';
    if (/(recarregamento|recarga)/.test(p)) return isPercent ? 'reload_time_pct' : 'tempo de recarga';
    if (/velocidade.*mira/.test(p) || /velocidade.*mira/.test(c)) return isPercent ? 'aimed_movement_speed_pct' : 'velocidade ao mirar';
    if (/velocidade.*(movimento|maxima|corrida)/.test(p) || /velocidade.*(movimento|maxima|corrida)/.test(c)) {
      return isPercent ? 'movement_speed_pct' : 'velocidade maxima';
    }
    if (/(vida|saude)/.test(p)) return isPercent ? 'health_max_pct' : 'vida';
    if (/armadura/.test(p)) return isPercent ? 'armor_max_pct' : 'armadura';
    if (/poder.*perfuracao/.test(p) || /poderperfuracao/.test(c)) return 'poder de perfuracao da arma';
    if (/(penetracao|perfuracao)/.test(p)) return 'perfuracao de armadura';
    if (/dispersao.*mira/.test(p) || /dispersao.*mira/.test(c)) return isPercent ? 'dispersao de tiro com mira da arma percentual' : 'dispersao de tiro com mira da arma';
    if (/dispersao/.test(p)) return isPercent ? 'dispersao de tiro da arma percentual' : 'dispersao de tiro da arma';
    if (/(municao|pente|carregador)/.test(p)) return 'capacidade de municao';

    return `${p}${isPercent ? ' percentual' : ''}`.trim();
  }

  function parseBonusDescription(description = '') {
    const text = String(description || '')
      .replace(/−/g, '-')
      .replace(/\u00a0/g, ' ');
    const stats = {};
    const regex = /([+-])\s*(\d+(?:[.,]\d+)?)\s*(%)?\s*(?:ao|à|a|de|do|da)?\s*([^+\-;\n.]+)/gi;
    let match;

    while ((match = regex.exec(text))) {
      const sign = match[1] === '-' ? -1 : 1;
      const rawNumber = numberFrom(match[2]);
      if (rawNumber === null) continue;

      const isPercent = Boolean(match[3]);
      const phrase = String(match[4] || '').trim();
      if (!phrase || /^bonus\s+de\s+\d+\s+pecas?/i.test(normalize(phrase))) continue;

      const key = canonicalLegacyKey(phrase, isPercent);
      if (!key) continue;
      const value = sign * rawNumber;
      stats[key] = Number(stats[key] || 0) + value;
    }

    return stats;
  }

  function signatureFor(key, value) {
    const normalizedKey = canonicalLegacyKey(key, isPercentKey(key));
    return `${normalize(normalizedKey)}::${Number(value)}`;
  }

  function publishAudit(nextAudit) {
    const merged = new Map();
    for (const item of (globalThis.__echoBonusAudit || [])) {
      merged.set(String(item.id || `${item.setId}:${item.pieces}`), item);
    }
    for (const item of nextAudit) {
      merged.set(String(item.id || `${item.setId}:${item.pieces}`), item);
    }
    globalThis.__echoBonusAudit = [...merged.values()];
    try {
      document.dispatchEvent(new CustomEvent('echo:bonus-audit'));
    } catch {}
  }

  function augmentBonusRows(rows = []) {
    const cloned = rows.map(row => ({ ...row }));
    const bySet = new Map();

    cloned.forEach(row => {
      const setKey = String(row.set_id || '__sem_set__');
      if (!bySet.has(setKey)) bySet.set(setKey, []);
      bySet.get(setKey).push(row);
    });

    const audit = [];

    for (const group of bySet.values()) {
      group.sort((a, b) => Number(a.required_pieces || 0) - Number(b.required_pieces || 0));
      const inherited = new Set();

      for (const row of group) {
        if (hasStructuredStats(row.stats)) {
          Object.entries(row.stats).forEach(([key, value]) => inherited.add(signatureFor(key, value)));
          row.__echo_bonus_status = 'structured';
          audit.push({
            id: row.id,
            setId: row.set_id,
            pieces: row.required_pieces,
            source: 'stats',
            status: 'structured',
            stats: row.stats,
            title: row.title || '',
            description: row.description || ''
          });
          continue;
        }

        const parsed = parseBonusDescription(row.description || '');
        const incremental = {};
        for (const [key, value] of Object.entries(parsed)) {
          const signature = signatureFor(key, value);
          if (inherited.has(signature)) continue;
          inherited.add(signature);
          incremental[key] = value;
        }

        row.stats = incremental;
        const hasNumericClaim = /[+-]\s*\d/.test(String(row.description || ''));
        row.__echo_bonus_status = Object.keys(incremental).length
          ? 'derived'
          : (hasNumericClaim ? 'unresolved' : 'text-only');

        audit.push({
          id: row.id,
          setId: row.set_id,
          pieces: row.required_pieces,
          source: 'description',
          status: row.__echo_bonus_status,
          stats: incremental,
          title: row.title || '',
          description: row.description || ''
        });
      }
    }

    publishAudit(audit);

    const unresolved = audit.filter(item => item.status === 'unresolved');
    if (unresolved.length) {
      console.error('[Echo Arena] Bônus com valor numérico sem regra calculável:', unresolved);
    }
    const derived = audit.filter(item => item.status === 'derived').length;
    const structured = audit.filter(item => item.status === 'structured').length;
    console.info(`[Echo Arena] Auditoria de bônus: ${structured} estruturado(s), ${derived} legado(s) convertido(s), ${unresolved.length} não resolvido(s).`);

    return cloned;
  }

  function shouldRewriteBonusRequest(url) {
    try {
      const parsed = new URL(url, location.href);
      if (!/\/rest\/v1\/equipment_set_bonuses$/.test(parsed.pathname)) return false;
      const select = parsed.searchParams.get('select') || '';
      return select.replace(/\s/g, '') === 'id,stats';
    } catch {
      return false;
    }
  }

  function expandedBonusUrl(url, includeStats = true) {
    const parsed = new URL(url, location.href);
    parsed.searchParams.set('select', includeStats
      ? 'id,stats,set_id,required_pieces,title,description'
      : 'id,set_id,required_pieces,title,description');
    return parsed.toString();
  }

  function requestWithUrl(input, url) {
    if (typeof Request !== 'undefined' && input instanceof Request) return new Request(url, input);
    return url;
  }

  function jsonResponseLike(response, data) {
    const headers = new Headers(response.headers);
    headers.set('content-type', 'application/json; charset=utf-8');
    headers.delete('content-length');
    return new Response(JSON.stringify(data), {
      status: 200,
      statusText: 'OK',
      headers
    });
  }

  const originalFetch = globalThis.fetch?.bind(globalThis);
  if (originalFetch && !globalThis.__echoBonusFetchPatched) {
    globalThis.__echoBonusFetchPatched = true;
    globalThis.fetch = async function echoArenaFetch(input, init) {
      const inputUrl = typeof input === 'string' || input instanceof URL ? String(input) : input?.url;
      if (!inputUrl || !shouldRewriteBonusRequest(inputUrl)) return originalFetch(input, init);

      const expandedUrl = expandedBonusUrl(inputUrl, true);
      let response = await originalFetch(requestWithUrl(input, expandedUrl), init);

      /* Se a coluna stats ainda não existir no banco, não escondemos o bônus:
         buscamos os dados reais textuais e derivamos somente efeitos reconhecidos. */
      if (!response.ok) {
        const fallbackUrl = expandedBonusUrl(inputUrl, false);
        const fallbackResponse = await originalFetch(requestWithUrl(input, fallbackUrl), init);
        if (!fallbackResponse.ok) return response;
        try {
          const fallbackData = await fallbackResponse.clone().json();
          if (!Array.isArray(fallbackData)) return response;
          return jsonResponseLike(fallbackResponse, augmentBonusRows(fallbackData));
        } catch (error) {
          console.warn('[Echo Arena] Falha ao preparar fallback dos bônus:', error);
          return response;
        }
      }

      try {
        const data = await response.clone().json();
        if (!Array.isArray(data)) return response;
        return jsonResponseLike(response, augmentBonusRows(data));
      } catch (error) {
        console.warn('[Echo Arena] Falha ao auditar bônus de conjunto:', error);
        return response;
      }
    };
  }

  const accent = word => ({
    visao: 'visão', heroi: 'herói', inimigo: 'inimigo', municao: 'munição',
    precisao: 'precisão', armadura: 'armadura', recarga: 'recarga',
    recarregamento: 'recarregamento', velocidade: 'velocidade', saude: 'saúde',
    penetracao: 'penetração', perfuracao: 'perfuração', maxima: 'máxima',
    dispersao: 'dispersão'
  }[word] || word);

  /*
   * Apresentação conservadora:
   * esta camada pode deixar um nome menos "bonito", mas nunca deve trocar
   * a mecânica do atributo apenas porque uma palavra coincide. O rótulo
   * original continua sendo a fonte quando não há correspondência segura.
   */
  function smartPresentation(sourceText, valueText = '') {
    const source = normalize(sourceText);
    const joined = compact(sourceText);
    const numeric = Number(String(valueText).replace(/[^0-9+\-.,]/g, '').replace(',', '.'));
    const negative = Number.isFinite(numeric) && numeric < 0;
    const isPercent = /percentual|porcentagem/.test(source) || /percentual|porcentagem/.test(joined)
      || /_pct$/.test(String(sourceText)) || /%/.test(String(valueText));

    let label = '';
    let description = '';
    let mapped = false;

    if (/dano.*(armadura|drone)/.test(source) || /dano.*(armadura|drone)/.test(joined)) {
      label = 'Dano contra armadura';
      description = negative ? 'Reduz o dano causado à armadura inimiga.' : 'Aumenta o dano causado à armadura inimiga.';
      mapped = true;
    } else if (/dano.*vida/.test(source) || /dano.*vida/.test(joined)) {
      label = 'Dano contra vida';
      description = negative ? 'Reduz o dano causado à vida inimiga.' : 'Aumenta o dano causado à vida inimiga.';
      mapped = true;
    } else if (/^(?:health(?: max)?(?: pct)?|vida(?: maxima)?(?: percentual| porcentagem)?|saude(?: maxima)?(?: percentual| porcentagem)?)$/.test(source)) {
      label = negative ? 'Redução de vida' : (isPercent ? 'Aumento de vida' : 'Vida');
      description = isPercent ? 'Percentual aplicado sobre a vida atual do herói.' : 'Altera a vida total do herói.';
      mapped = true;
    } else if (/^(?:armor(?: max)?(?: pct)?|armadura(?: maxima)?(?: percentual| porcentagem)?)$/.test(source)) {
      label = negative ? 'Redução de armadura' : (isPercent ? 'Aumento de armadura' : 'Armadura');
      description = isPercent ? 'Percentual aplicado sobre a armadura atual do herói.' : 'Altera a armadura total do herói.';
      mapped = true;
    } else if (/(alcance|distancia).*visao/.test(source) || /(alcance|distancia).*visao/.test(joined)) {
      label = 'Alcance de visão';
      description = negative ? 'Reduz o campo de visão do herói.' : 'Amplia o campo de visão do herói.';
      mapped = true;
    } else if (/alcance.*mira/.test(source) || /alcance.*mira/.test(joined)) {
      label = 'Alcance com mira';
      description = negative ? 'Reduz o alcance de tiro com mira.' : 'Amplia o alcance de tiro com mira.';
      mapped = true;
    } else if (/(recarregamento|recarga)/.test(source) && !/(habilidade|especial|ultimate|skill)/.test(source)) {
      label = negative ? 'Recarga mais rápida' : 'Tempo de recarga';
      description = negative ? 'Reduz o tempo de recarga do herói.' : 'Aumenta o tempo de recarga do herói.';
      mapped = true;
    } else if (/velocidade.*mira/.test(source) || /velocidade.*mira/.test(joined)) {
      label = 'Velocidade ao mirar';
      description = negative ? 'Reduz a velocidade enquanto mira.' : 'Aumenta a velocidade enquanto mira.';
      mapped = true;
    } else if (/velocidade.*(movimento|maxima|corrida)/.test(source) || /velocidade.*(movimento|maxima|corrida)/.test(joined)) {
      label = 'Velocidade de movimento';
      description = negative ? 'Reduz a velocidade de movimento do herói.' : 'Aumenta a velocidade de movimento do herói.';
      mapped = true;
    } else if (/poder.*perfuracao/.test(source) || /poderperfuracao/.test(joined)) {
      label = 'Poder de perfuração';
      description = negative ? 'Reduz o poder de perfuração da arma.' : 'Aumenta o poder de perfuração da arma.';
      mapped = true;
    } else if (/(?:armor penetration|penetracao de armadura|perfuracao de armadura)/.test(source) || /(?:armorpenetration|penetracaodearmadura|perfuracaodearmadura)/.test(joined)) {
      label = 'Penetração de armadura';
      description = negative ? 'Reduz a capacidade de atravessar armadura.' : 'Aumenta a capacidade de atravessar armadura.';
      mapped = true;
    } else if (/dispersao.*mira/.test(source) || /dispersao.*mira/.test(joined)) {
      label = 'Dispersão com mira';
      description = negative ? 'Reduz a dispersão dos tiros enquanto mira.' : 'Aumenta a dispersão dos tiros enquanto mira.';
      mapped = true;
    } else if (/dispersao/.test(source) || /dispersao/.test(joined)) {
      label = 'Dispersão de tiro';
      description = negative ? 'Reduz a dispersão dos tiros da arma.' : 'Aumenta a dispersão dos tiros da arma.';
      mapped = true;
    } else if (/(?:capacidade|tamanho).*(?:municao|pente|carregador)/.test(source) || /(?:magazine.*size|capacidade.*municao)/.test(source)) {
      label = 'Capacidade de munição';
      description = negative ? 'Reduz a munição disponível por carregador.' : 'Aumenta a munição disponível por carregador.';
      mapped = true;
    }

    if (!label) {
      const cleaned = source
        .replace(/\bpercentual\b|\bporcentagem\b/g, '')
        .replace(/\bdo heroi\b|\bdo inimigo\b/g, '')
        .replace(/\s+/g, ' ').trim();
      label = cleaned.split(' ').map(accent).join(' ');
      if (label) label = label.charAt(0).toUpperCase() + label.slice(1);
    }

    let formattedValue = String(valueText || '').trim();
    if (isPercent && formattedValue && !formattedValue.includes('%')) formattedValue += '%';

    return { label, description, formattedValue, isPercent, mapped };
  }

  function updateCreateBuildCard(card) {
    const labelNode = card.querySelector('.stat-label');
    const valueNode = card.querySelector('.stat-val');
    const descNode = card.querySelector('.stat-desc');
    if (!labelNode || !valueNode) return;

    const source = descNode?.textContent?.trim() || labelNode.textContent?.trim() || '';
    const value = valueNode.textContent?.trim() || '';
    const presentation = smartPresentation(source, value);

    /* Atributos sem correspondência semântica segura mantêm exatamente a
       identidade fornecida pelo cadastro. A camada visual da página pode
       apenas humanizar essa escrita, nunca trocar a mecânica. */
    if (presentation.mapped && presentation.label && labelNode.textContent.trim() !== presentation.label) {
      labelNode.textContent = presentation.label;
    }
    if (presentation.formattedValue && valueNode.textContent.trim() !== presentation.formattedValue) {
      const svg = valueNode.querySelector('svg')?.parentElement?.cloneNode(true);
      valueNode.replaceChildren();
      if (svg) valueNode.appendChild(svg);
      valueNode.append(document.createTextNode(presentation.formattedValue));
    }
    if (presentation.mapped && descNode && presentation.description && descNode.textContent.trim() !== presentation.description) {
      descNode.textContent = presentation.description;
    }
  }

  function updateEquipmentRow(row) {
    const labelNode = row.querySelector('span');
    const valueNode = row.querySelector('strong');
    if (!labelNode || !valueNode) return;
    const presentation = smartPresentation(labelNode.textContent || '', valueNode.textContent || '');
    if (presentation.mapped && presentation.label && labelNode.textContent.trim() !== presentation.label) {
      labelNode.textContent = presentation.label;
    }
    if (presentation.formattedValue && valueNode.textContent.trim() !== presentation.formattedValue) {
      valueNode.textContent = presentation.formattedValue;
    }
  }

  function ensureAuditStyles() {
    if (document.getElementById('echo-bonus-audit-styles')) return;
    const style = document.createElement('style');
    style.id = 'echo-bonus-audit-styles';
    style.textContent = `
      .bonus-calc-audit{margin-top:10px;padding-top:9px;border-top:1px solid rgba(148,163,184,.16);font-family:Inter,sans-serif}
      .bonus-calc-state{display:inline-flex;align-items:center;gap:6px;padding:5px 8px;border-radius:999px;font-size:9px;font-weight:900;letter-spacing:.07em;text-transform:uppercase}
      .bonus-calc-state.is-applied{color:#51e6a1;background:rgba(53,208,127,.10);border:1px solid rgba(53,208,127,.30)}
      .bonus-calc-state.is-ready{color:#b8c3d8;background:rgba(148,163,184,.08);border:1px solid rgba(148,163,184,.18)}
      .bonus-calc-state.is-error{color:#ff8795;background:rgba(255,84,112,.09);border:1px solid rgba(255,84,112,.28)}
      .bonus-calc-effects{display:grid;gap:4px;margin-top:7px;font-size:10px;line-height:1.35;color:#aeb9ca}
      .bonus-calc-effects b{color:#f4f7fb;font-weight:800}
      .bonus-calc-source{display:block;margin-top:6px;color:#6f7d93;font-size:8.5px;letter-spacing:.04em;text-transform:uppercase}
    `;
    document.head.appendChild(style);
  }

  function auditScore(audit, mileText) {
    const words = normalize(audit.description || '')
      .split(' ')
      .filter(word => word.length > 3 && !['bonus', 'pecas', 'heroi'].includes(word));
    const target = normalize(mileText);
    return words.reduce((score, word) => score + (target.includes(word) ? 1 : 0), 0);
  }

  function auditForMile(mile) {
    const pieces = Number((mile.querySelector('.mile-qtd')?.textContent || '').match(/\d+/)?.[0] || 0);
    const candidates = (globalThis.__echoBonusAudit || []).filter(item => Number(item.pieces) === pieces);
    if (!candidates.length) return null;
    if (candidates.length === 1) return candidates[0];
    const text = mile.querySelector('.mile-desc')?.textContent || '';
    return candidates
      .map(item => ({ item, score: auditScore(item, text) }))
      .sort((a, b) => b.score - a.score)[0]?.item || candidates[0];
  }

  function effectLines(stats = {}) {
    return Object.entries(stats).map(([key, value]) => {
      const percent = isPercentKey(key);
      const numeric = Number(value);
      const raw = `${numeric >= 0 ? '+' : ''}${Number.isFinite(numeric) ? numeric : value}${percent ? '%' : ''}`;
      const presentation = smartPresentation(key, raw);
      return `<span><b>${presentation.formattedValue || raw}</b> ${presentation.label || key}</span>`;
    }).join('');
  }

  function updateBonusMile(mile) {
    const audit = auditForMile(mile);
    if (!audit) return;

    ensureAuditStyles();
    const unlocked = mile.classList.contains('unlocked');
    const calculable = hasStructuredStats(audit.stats);
    let box = mile.querySelector('.bonus-calc-audit');
    if (!box) {
      box = document.createElement('div');
      box.className = 'bonus-calc-audit';
      mile.appendChild(box);
    }

    let stateClass = 'is-ready';
    let stateText = 'Pronto para ativar';
    if (unlocked && calculable) {
      stateClass = 'is-applied';
      stateText = '✓ Ativo · enviado ao cálculo';
    } else if (!calculable) {
      stateClass = 'is-error';
      stateText = unlocked ? '⚠ Ativo, mas sem regra calculável' : '⚠ Sem regra calculável';
    }

    const sourceText = audit.status === 'structured'
      ? 'Fonte: dados estruturados do bônus'
      : audit.status === 'derived'
        ? 'Fonte: descrição real convertida para cálculo'
        : 'Fonte: descrição sem conversão segura';

    const html = `
      <span class="bonus-calc-state ${stateClass}">${stateText}</span>
      ${calculable ? `<div class="bonus-calc-effects">${effectLines(audit.stats)}</div>` : ''}
      <small class="bonus-calc-source">${sourceText}</small>`;

    if (box.innerHTML !== html) box.innerHTML = html;
  }

  let scheduled = false;
  function scanPresentation() {
    scheduled = false;
    /* criar-build usa .stat, não .stat-card */
    document.querySelectorAll('#equipment-detail .stat').forEach(updateCreateBuildCard);
    document.querySelectorAll('#equipment-detail .mile').forEach(updateBonusMile);
    document.querySelectorAll('#eq-detail .st-row').forEach(updateEquipmentRow);
  }

  function schedulePresentation() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(scanPresentation);
  }

  if (typeof document !== 'undefined' && !globalThis.__echoStatPresentationObserver) {
    globalThis.__echoStatPresentationObserver = true;
    const start = () => {
      ensureAuditStyles();
      schedulePresentation();
      document.addEventListener('echo:bonus-audit', schedulePresentation);
      new MutationObserver(schedulePresentation).observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true
      });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  }
})();